// Proves the browser flasher does to a bootloader what picotool does: the
// UF2 parser accepts the firmware and rejects what it should, and the
// PICOBOOT client drives a model of the RP2040 ROM (fake-bootloader.mjs)
// through a flash, a read-back and a reboot without a real board.
//
//   node software/tools/verify-flash.mjs
//
// The image is software/controller/build/controller.uf2 when one has been
// built or fetched; otherwise a synthetic UF2 with a hole in it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseUf2, planSectors, describe, RP2040_FAMILY, UF2_MAGIC0, UF2_MAGIC1, UF2_MAGIC_END, UF2_FLAG_FAMILY_ID, SECTOR, PAGE, FLASH_BASE } from '../../src/uf2.js';
import { Picoboot, flashSectors, encodeCommand, findPicoboot, CMD, EXCLUSIVE, SRAM_END_RP2040 } from '../../src/picoboot.js';
import { FakeBootloader } from './fake-bootloader.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

let failed = 0;
const fail = (msg) => { failed++; console.error(`  FAIL ${msg}`); };
const ok = (cond, msg) => { if (!cond) fail(msg); };
const throws = (fn, re, msg) => {
  try { fn(); fail(`${msg}: did not throw`); }
  catch (e) { if (!re.test(e.message)) fail(`${msg}: threw "${e.message}"`); }
};
const rejects = async (p, re, msg) => {
  try { await p; fail(`${msg}: did not reject`); }
  catch (e) { if (!re.test(e.message)) fail(`${msg}: rejected with "${e.message}"`); }
};

// ---------------------------------------------------------------- a UF2 ----

function makeUf2(blocks, { family = RP2040_FAMILY, flags = UF2_FLAG_FAMILY_ID } = {}) {
  const out = new Uint8Array(blocks.length * 512);
  blocks.forEach(({ addr, data }, i) => {
    const v = new DataView(out.buffer, i * 512, 512);
    v.setUint32(0, UF2_MAGIC0, true);
    v.setUint32(4, UF2_MAGIC1, true);
    v.setUint32(8, flags, true);
    v.setUint32(12, addr, true);
    v.setUint32(16, data.length, true);
    v.setUint32(20, i, true);
    v.setUint32(24, blocks.length, true);
    v.setUint32(28, family, true);
    out.set(data, i * 512 + 32);
    v.setUint32(508, UF2_MAGIC_END, true);
  });
  return out;
}

const page = (seed) => Uint8Array.from({ length: PAGE }, (_, i) => (seed * 31 + i * 7) & 0xFF);

// 5 pages, then a hole of one page, then 2 pages in the next sector
const synthetic = makeUf2([
  ...[0, 1, 2, 3, 4].map(i => ({ addr: FLASH_BASE + i * PAGE, data: page(i) })),
  { addr: FLASH_BASE + SECTOR + 0 * PAGE, data: page(20) },
  { addr: FLASH_BASE + SECTOR + 1 * PAGE, data: page(21) },
]);

// ----------------------------------------------------------- the parser ----

console.log('uf2');
{
  const img = parseUf2(synthetic);
  ok(img.blocks.length === 7 && img.bytes === 7 * PAGE, 'synthetic: 7 blocks');
  ok(img.familyName === 'RP2040', 'synthetic: family');
  const sectors = planSectors(img);
  ok(sectors.length === 2, `synthetic: 2 sectors, got ${sectors.length}`);
  ok(sectors[0].addr === FLASH_BASE && sectors[1].addr === FLASH_BASE + SECTOR, 'synthetic: sector addresses');
  ok(sectors[0].data.length === SECTOR, 'synthetic: whole sectors');
  ok(sectors[0].data[5 * PAGE] === 0xFF && sectors[0].data[SECTOR - 1] === 0xFF, 'synthetic: the hole and the tail are 0xFF');
  ok(sectors[0].data[3 * PAGE + 9] === page(3)[9], 'synthetic: page 3 landed in place');
  ok(sectors[1].data[PAGE + 1] === page(21)[1], 'synthetic: the second sector holds pages 20-21');

  throws(() => parseUf2(synthetic.slice(0, 512 * 3 + 100)), /multiple of 512/, 'odd length');
  throws(() => parseUf2(synthetic.slice(0, 512 * 3)), /declares 7 blocks but holds 3/, 'truncated');
  throws(() => parseUf2(makeUf2([{ addr: FLASH_BASE, data: page(0) }], { family: 0xE48BFF59 })), /RP2350/, 'wrong family');
  throws(() => parseUf2(makeUf2([{ addr: FLASH_BASE, data: page(0) }], { flags: 0 })), /no family/, 'no family');
  throws(() => parseUf2(makeUf2([{ addr: 0x20000000, data: page(0) }])), /not flash/, 'RAM address');
  throws(() => parseUf2(makeUf2([{ addr: FLASH_BASE + 16, data: page(0) }])), /page-aligned/, 'unaligned');
  const bad = synthetic.slice(); bad[512 + 1] ^= 0xFF;
  throws(() => parseUf2(bad), /bad magic in block 1/, 'bad magic');
  throws(() => parseUf2(new Uint8Array(1024)), /bad magic/, 'zeros');
}

const real = path.join(REPO, 'software', 'controller', 'build', 'controller.uf2');
let image;
if (fs.existsSync(real)) {
  image = parseUf2(fs.readFileSync(real));
  console.log(`  controller.uf2: ${describe(image)}`);
  ok(image.blocks[0].addr === FLASH_BASE, 'controller.uf2 starts at the flash base');
} else {
  image = parseUf2(synthetic);
  console.log(`  no build/controller.uf2; using the synthetic image: ${describe(image)}`);
}

// -------------------------------------------------------- the encoding ----

console.log('picoboot');
{
  const b = encodeCommand({ token: 7, id: CMD.REBOOT, args: new Uint8Array([0, 0, 0, 0, 0, 0x20, 4, 0x20, 0xF4, 1, 0, 0]) });
  ok(b.length === 32, 'command is 32 bytes');
  ok(b[0] === 0x0B && b[1] === 0xD1 && b[2] === 0x1F && b[3] === 0x43, 'magic is little-endian 0x431fd10b');
  ok(b[4] === 7 && b[8] === 0x02 && b[9] === 12 && b[12] === 0, 'token, id, size, no transfer');
  ok(b[24] === 0xF4 && b[25] === 0x01, 'the delay rides in the args');
  throws(() => encodeCommand({ token: 1, id: 1, args: new Uint8Array(17) }), /16 bytes/, 'args overflow');

  const dev = new FakeBootloader();
  const found = findPicoboot(dev);
  ok(found && found.interfaceNumber === 1 && found.outEp === 3 && found.inEp === 4, 'finds the vendor interface and its endpoints');
  ok(findPicoboot({ configurations: [{ configurationValue: 1, interfaces: [dev.configurations[0].interfaces[0]] }] }) === null,
     'a mass-storage-only device has no PICOBOOT');
}

// ------------------------------------------------------------ the flash ----

const sectors = planSectors(image);
{
  const dev = new FakeBootloader();
  const conn = new Picoboot(dev);
  const seen = [];
  conn.log = (line) => seen.push(line);
  const progress = [];
  await conn.open();
  ok(dev.opened && dev.claimed.has(1) && dev.resets === 1, 'open claims interface 1 and resets it');
  await flashSectors(conn, sectors, { onProgress: (p) => progress.push(p) });
  await conn.close();

  ok(dev.exclusive === EXCLUSIVE.YES, 'took exclusive access');
  ok(dev.commands[0] === CMD.EXCLUSIVE_ACCESS && dev.commands[1] === CMD.EXIT_XIP, 'exclusive access, then EXIT_XIP, before any flash command');
  ok(dev.erased.length === sectors.length && dev.erased.every((a, i) => a === sectors[i].addr), 'every sector erased once, in order');
  ok(dev.writes.length === sectors.length && dev.writes.every(w => w.len === SECTOR), 'every sector written whole');
  for (const { addr, data } of sectors) {
    const s = dev.flash.get(addr);
    if (!s || s.some((b, i) => b !== data[i])) { fail(`flash at 0x${addr.toString(16)} differs from the image`); break; }
  }
  for (const { addr, data } of image.blocks) {
    const s = dev.flash.get(addr & ~(SECTOR - 1));
    const at = addr & (SECTOR - 1);
    if (data.some((b, i) => s[at + i] !== b)) { fail(`block at 0x${addr.toString(16)} did not land`); break; }
  }
  ok(!dev.commands.includes(CMD.ENTER_CMD_XIP), 'no ENTER_CMD_XIP: reads go through serial command mode like the writes');
  ok(dev.commands.filter(c => c === CMD.READ).length === sectors.length, 'read every sector back');
  ok(dev.commands[dev.commands.length - 1] === CMD.REBOOT, 'REBOOT is the last command');
  ok(dev.rebooted && dev.rebooted.pc === 0 && dev.rebooted.sp === SRAM_END_RP2040 && dev.rebooted.delayMs === 500, 'reboot into flash with the 500 ms delay');
  ok(dev.pending === null && dev.halted.size === 0, 'nothing left half-done on the device');
  ok(!dev.opened && !dev.claimed.has(1), 'closed and released');
  const phases = [...new Set(progress.map(p => p.phase))];
  ok(phases.join() === 'erase,write,verify,reboot', `progress phases in order, got ${phases.join()}`);
  ok(progress.filter(p => p.phase === 'write').length === sectors.length + 1, 'one write progress per sector plus the final');
  console.log(`  ${sectors.length} sectors flashed, read back and rebooted on the model; ${seen.length} protocol lines`);
}

// ----------------------------------------------------------- the errors ----

console.log('errors');
{
  // a read-back that disagrees stops before the reboot and names the address
  const dev = new FakeBootloader();
  dev.corruptAt = sectors[0].addr + 300;
  const conn = new Picoboot(dev);
  await conn.open();
  await rejects(flashSectors(conn, sectors), /verify: 0x1000012c/, 'verify names the bad address');
  ok(dev.rebooted === null, 'no reboot after a failed verify');

  // the ROM's own refusals come back as words, and the connection is reset
  const dev2 = new FakeBootloader();
  const c2 = new Picoboot(dev2);
  await c2.open();
  await rejects(c2.flashErase(FLASH_BASE, SECTOR), /invalid state/, 'erase before EXIT_XIP is refused by the device');
  ok(dev2.resets === 2 && dev2.halted.size === 0, 'a refusal resets the interface and clears the halt');
  await rejects(c2.read(FLASH_BASE, 16), /invalid state/, 'a flash read before EXIT_XIP is refused too');
  await c2.exitXip();
  await c2.flashErase(FLASH_BASE, SECTOR);
  await rejects(c2.write(FLASH_BASE + 16, new Uint8Array(PAGE)), /page-aligned/, 'the client refuses an unaligned write itself');
  await rejects(c2.flashErase(0x20000000, SECTOR), /invalid address/, 'an erase outside flash is refused by the device');
  const back = await c2.read(FLASH_BASE, 16);
  ok(back.length === 16 && back.every(b => b === 0xFF), 'an erased sector reads as 0xFF');
  await c2.close();

  // no PICOBOOT interface: the badge is still running the controller firmware
  const notBoot = new FakeBootloader();
  notBoot.configurations[0].interfaces.pop();
  await rejects(new Picoboot(notBoot).open(), /no PICOBOOT interface/, 'a device without the interface is named as such');
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nflash: ok');
