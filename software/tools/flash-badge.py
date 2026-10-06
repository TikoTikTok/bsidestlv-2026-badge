#!/usr/bin/env python3
"""Flash the badge over USB: find the RPI-RP2 bootloader drive, copy a UF2 onto
it, and wait for the board to come back as the controller.

    python3 software/tools/flash-badge.py                   # software/controller/build/controller.uf2
    python3 software/tools/flash-badge.py path/to/other.uf2
    python3 software/tools/flash-badge.py --fetch           # pull the latest green CI build first (gh)
    python3 software/tools/flash-badge.py --status          # what is plugged in right now

Getting the badge into the bootloader, any of:

  - hold BootSel while plugging in USB-C;
  - with it plugged in, hold BootSel and tap Reset;
  - on firmware from this branch, hold SELECT + START for two seconds.

The board then mounts as a small FAT drive called RPI-RP2 - that is the
RP2040's ROM bootloader, nothing to install. This script waits for it, checks
the UF2 really is for an RP2040, copies it, waits for the drive to disappear
(the ROM reboots as soon as the last block lands) and then looks for the
controller's USB identity (Sony 054c:09cc, see src/ds4.h) to confirm the new
firmware is running.

Windows, macOS and Linux. Standard library only, like everything in tools/.
On Linux, if the drive does not auto-mount, mount it and pass --drive.
"""

import argparse
import glob
import json
import os
import platform
import re
import struct
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
DEFAULT_UF2 = os.path.join(REPO, 'software', 'controller', 'build', 'controller.uf2')

UF2_MAGIC0, UF2_MAGIC1, UF2_MAGIC_END = 0x0A324655, 0x9E5D5157, 0x0AB16F30
UF2_FLAG_FAMILY = 0x2000
FAMILY = {
    0xE48BFF56: 'RP2040',
    0xE48BFF59: 'RP2350 (ARM-S)',
    0xE48BFF5A: 'RP2350 (RISC-V)',
    0xE48BFF5B: 'RP2350 (ARM-NS)',
}

CONTROLLER_VID, CONTROLLER_PID = 0x054C, 0x09CC     # what the firmware reports, src/ds4.h
BOOT_VID, BOOT_PID = 0x2E8A, 0x0003                 # RP2040 ROM bootloader (RPI-RP2)

SYS = platform.system()


# ------------------------------------------------------------------ the UF2 ----

def inspect_uf2(path):
    with open(path, 'rb') as f:
        data = f.read()
    if not data or len(data) % 512:
        sys.exit(f'{path}: not a UF2 (size {len(data)} is not a multiple of 512)')
    m0, m1, flags, addr, size, _blk, nblk, fam = struct.unpack_from('<8I', data, 0)
    (end,) = struct.unpack_from('<I', data, 508)
    if (m0, m1, end) != (UF2_MAGIC0, UF2_MAGIC1, UF2_MAGIC_END):
        sys.exit(f'{path}: not a UF2 (bad block magic)')
    family = FAMILY.get(fam, f'0x{fam:08x}') if flags & UF2_FLAG_FAMILY else 'none'
    return {'blocks': len(data) // 512, 'declared': nblk, 'family': family,
            'addr': addr, 'bytes': nblk * size}


# --------------------------------------------------------- what is plugged in ----

def uf2_drives():
    """Mounted UF2 bootloader drives as [(root, board_id)]."""
    if SYS == 'Windows':
        roots = [f'{d}:\\' for d in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
    elif SYS == 'Darwin':
        roots = glob.glob('/Volumes/*')
    else:
        roots = (glob.glob('/media/*') + glob.glob('/media/*/*') +
                 glob.glob('/run/media/*/*') + glob.glob('/mnt/*'))
    found = []
    for root in roots:
        info = os.path.join(root, 'INFO_UF2.TXT')
        try:
            if not os.path.isfile(info):
                continue
            with open(info, errors='replace') as f:
                text = f.read()
        except OSError:
            continue
        m = re.search(r'Board-ID:\s*(\S+)', text)
        found.append((root, m.group(1) if m else '?'))
    return found


def usb_present(vid, pid):
    """True / False, or None when the platform gives no way to tell."""
    try:
        if SYS == 'Windows':
            like = f"USB\\VID_{vid:04X}&PID_{pid:04X}*"
            cmd = ("@(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | "
                   f"Where-Object {{ $_.InstanceId -like '{like}' }}).Count")
            out = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', cmd],
                                 capture_output=True, text=True, timeout=30).stdout.strip()
            return out.isdigit() and int(out) > 0
        if SYS == 'Darwin':
            out = subprocess.run(['ioreg', '-p', 'IOUSB', '-l', '-w0'],
                                 capture_output=True, text=True, timeout=30).stdout
            for block in out.split('+-o ')[1:]:
                if f'"idVendor" = {vid}' in block and f'"idProduct" = {pid}' in block:
                    return True
            return False
        for dev in glob.glob('/sys/bus/usb/devices/*/idVendor'):
            d = os.path.dirname(dev)
            try:
                with open(dev) as f_v, open(os.path.join(d, 'idProduct')) as f_p:
                    if int(f_v.read(), 16) == vid and int(f_p.read(), 16) == pid:
                        return True
            except (OSError, ValueError):
                continue
        return False
    except (OSError, subprocess.SubprocessError):
        return None


def show_status():
    drives = uf2_drives()
    ctrl = usb_present(CONTROLLER_VID, CONTROLLER_PID)
    boot = usb_present(BOOT_VID, BOOT_PID)
    for root, board in drives:
        print(f'bootloader drive  {root}  (Board-ID {board})')
    if not drives:
        hint = '  (but a 2e8a:0003 RP2 boot device is attached - mount it)' if boot else ''
        print('bootloader drive  none mounted' + hint)
    words = {True: f'present ({CONTROLLER_VID:04x}:{CONTROLLER_PID:04x})',
             False: 'not present', None: 'cannot tell on this platform'}
    print('controller        ' + words[ctrl])


# --------------------------------------------------------------- the flash ----

def wait_for_drive(timeout):
    t0 = time.monotonic()
    hinted = False
    while True:
        drives = uf2_drives()
        if drives:
            if len(drives) > 1:
                print('more than one UF2 drive is mounted:', ', '.join(r for r, _ in drives))
                sys.exit('unplug the others, or pass --drive')
            return drives[0]
        if not hinted:
            hinted = True
            if usb_present(CONTROLLER_VID, CONTROLLER_PID):
                print('the badge is running the controller firmware; put it in the bootloader:')
                print('  hold BootSel and tap Reset  -  or hold SELECT + START for two seconds')
            else:
                print('waiting for the RPI-RP2 drive - hold BootSel while plugging the badge in')
        if time.monotonic() - t0 > timeout:
            sys.exit(f'no UF2 drive appeared in {timeout:.0f} s')
        time.sleep(0.3)


def copy_uf2(src, root):
    dst = os.path.join(root, os.path.basename(src))
    size = os.path.getsize(src)
    written = 0
    try:
        with open(src, 'rb') as f_in, open(dst, 'wb') as f_out:
            while True:
                chunk = f_in.read(64 * 1024)
                if not chunk:
                    break
                f_out.write(chunk)
                written += len(chunk)
            f_out.flush()
            try:
                os.fsync(f_out.fileno())
            except OSError:
                pass
    except OSError as e:
        # The ROM reboots the instant the last block lands, so the drive can
        # vanish under the close(). Only a short write is a real failure.
        if written < size:
            sys.exit(f'copy failed after {written} of {size} bytes: {e}')
    return written


def wait_until(pred, timeout, step=0.25):
    t0 = time.monotonic()
    while time.monotonic() - t0 < timeout:
        if pred():
            return True
        time.sleep(step)
    return False


# --------------------------------------------------------------- the fetch ----

def git(*args):
    return subprocess.run(['git', '-C', REPO, *args], capture_output=True, text=True, check=True).stdout.strip()


def detect_repo():
    url = git('remote', 'get-url', 'origin')
    m = re.search(r'github\.com[:/]([^/]+)/([^/.]+)', url)
    return f'{m.group(1)}/{m.group(2)}' if m else None


def fetch_latest(repo, branch, dest_dir):
    def gh(*args):
        try:
            return subprocess.run(['gh', *args], capture_output=True, text=True, check=True).stdout
        except FileNotFoundError:
            sys.exit('--fetch needs the GitHub CLI (gh) on PATH')
        except subprocess.CalledProcessError as e:
            sys.exit(f'gh {args[0]} failed: {e.stderr.strip()}')
    q = ['run', 'list', '--repo', repo, '--workflow', 'firmware.yml', '--status', 'success',
         '--limit', '1', '--json', 'databaseId,headSha,headBranch,createdAt']
    if branch:
        q += ['--branch', branch]
    runs = json.loads(gh(*q))
    if not runs:
        sys.exit(f'no successful Firmware run on {repo}' + (f' for {branch}' if branch else ''))
    run = runs[0]
    os.makedirs(dest_dir, exist_ok=True)
    target = os.path.join(dest_dir, 'controller.uf2')
    if os.path.exists(target):
        os.remove(target)
    gh('run', 'download', str(run['databaseId']), '--repo', repo, '--name', 'controller.uf2', '--dir', dest_dir)
    print(f"fetched controller.uf2 from run {run['databaseId']} "
          f"({run['headBranch']} @ {run['headSha'][:8]}, {run['createdAt'][:16]})")
    return target


# ---------------------------------------------------------------------- main ----

def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter,
                                 epilog='\n\n'.join(__doc__.split('\n\n')[1:]))
    ap.add_argument('uf2', nargs='?', default=DEFAULT_UF2,
                    help=f'the image (default: {os.path.relpath(DEFAULT_UF2, REPO)})')
    ap.add_argument('--fetch', action='store_true', help='download the newest successful CI build into build/ first')
    ap.add_argument('--repo', help='GitHub owner/name for --fetch (default: the origin remote)')
    ap.add_argument('--branch', help='branch for --fetch (default: the checked-out branch; "" for any)')
    ap.add_argument('--drive', help='bootloader drive root, when auto-detection cannot see it')
    ap.add_argument('--timeout', type=float, default=120, help='seconds to wait for the drive (default 120)')
    ap.add_argument('--no-verify', action='store_true', help='do not wait for the controller to re-enumerate')
    ap.add_argument('--status', action='store_true', help='report what is plugged in and exit')
    args = ap.parse_args()

    if args.status:
        show_status()
        return

    if args.fetch:
        repo = args.repo or detect_repo()
        if not repo:
            sys.exit('cannot work out the GitHub repo; pass --repo owner/name')
        branch = args.branch if args.branch is not None else git('rev-parse', '--abbrev-ref', 'HEAD')
        args.uf2 = fetch_latest(repo, branch or None, os.path.dirname(DEFAULT_UF2))

    if not os.path.isfile(args.uf2):
        sys.exit(f'{args.uf2}: no such file - build it, or pass --fetch to take the CI build')
    info = inspect_uf2(args.uf2)
    shown = os.path.relpath(args.uf2, REPO) if os.path.abspath(args.uf2).startswith(REPO) else args.uf2
    print(f"{shown}: {info['blocks']} blocks, {info['bytes']} bytes at 0x{info['addr']:08x}, family {info['family']}")
    if info['blocks'] != info['declared']:
        sys.exit(f"UF2 declares {info['declared']} blocks but holds {info['blocks']} - truncated download?")

    if args.drive:
        root, board = args.drive, '?'
    else:
        root, board = wait_for_drive(args.timeout)
    print(f'bootloader drive {root} (Board-ID {board})')
    if 'RP2350' in board and info['family'] == 'RP2040':
        sys.exit('this image is for an RP2040 but the board says RP2350 - rebuild with -DPICO_BOARD=pico2')
    if board.startswith('RPI-RP2') and info['family'].startswith('RP2350'):
        sys.exit('this image is for an RP2350 but the board is an RP2040')

    written = copy_uf2(args.uf2, root)
    print(f'wrote {written} bytes')

    gone = wait_until(lambda: not os.path.exists(os.path.join(root, 'INFO_UF2.TXT')), 15)
    if not gone:
        sys.exit('the drive is still mounted - the ROM did not take the image')
    print('board rebooted')

    if args.no_verify:
        return
    if usb_present(CONTROLLER_VID, CONTROLLER_PID) is None:
        print('cannot check enumeration on this platform; the LED blinks at 250 ms until a host binds the badge')
        return
    if wait_until(lambda: usb_present(CONTROLLER_VID, CONTROLLER_PID), 20, step=1):
        print(f'the badge is back as the controller ({CONTROLLER_VID:04x}:{CONTROLLER_PID:04x})')
    else:
        sys.exit('the badge did not re-enumerate as the controller within 20 s')


if __name__ == '__main__':
    main()
