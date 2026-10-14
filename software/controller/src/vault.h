#ifndef VAULT_H_
#define VAULT_H_

/*
 * The vault - the secret that makes the badge the key to the game.
 *
 * The site is static files anyone can fetch, so the only thing that can
 * stand between a crawler and a stage is a secret the site does not have.
 * This module keeps one: a 32-byte stage key written into the badge at the
 * booth, plus a short label saying which batch it belongs to. The site's
 * event stages are sealed with keys derived from it (src/seal.js) and the
 * page gets the key from the badge, never from the server or the repo.
 *
 * Two ways out of the badge, both read by src/vault.js on the page:
 *
 *   1. HID feature report 0xF1 - the DualShock 4 descriptor already declares
 *      it as a 63-byte vendor report, so the descriptor stays byte-identical
 *      to the real controller and iOS keeps binding. Chrome's WebHID reads it
 *      in one call. SET on the same report provisions the badge.
 *
 *   2. The beacon - phones have a Gamepad API but no WebHID, so while
 *      SELECT + Y is held the badge spells the same payload out on the four
 *      stick axes (this board has no sticks, they sit centred otherwise):
 *      left X is a clock that flips every symbol, the other three carry a
 *      nibble each, 16 levels on an 8-bit axis so any browser's float
 *      normalisation decodes it. 50 ms a symbol, 31 symbols a frame, a
 *      250 ms gap, repeat. A page decodes it from navigator.getGamepads().
 *
 * Writes are gated by physical presence: a provisioned badge only accepts a
 * new key or an erase while SELECT is physically held, so a page cannot wipe
 * a badge that was merely plugged in. A blank badge accepts its first key
 * without the chord, which is what the booth does in one go.
 *
 * Pure C, no SDK: main.c owns the flash sector and the report plumbing, and
 * software/controller/test/test_vault.c runs this on a PC.
 */

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define VAULT_KEY_LEN     32u
#define VAULT_LABEL_LEN   15u
#define VAULT_SERIAL_LEN   8u

// Flash record (60 bytes). Lives in the last 4 KB sector of the flash, which
// the firmware image never reaches (the UF2 is ~45 KB of 2 MB).
#define VAULT_RECORD_LEN  60u
#define VAULT_MAGIC       "VLT1"

#define VAULT_FLAG_PROVISIONED  0x01u

// HID feature report 0xF1: 63 bytes of payload after the report ID.
#define VAULT_REPORT_ID    0xF1u
#define VAULT_REPORT_LEN   63u
#define VAULT_REPORT_TAG   "ALICE"
#define VAULT_REPORT_VER   1u

// GET report layout
#define VAULT_R_TAG      0u    // 'A','L','I','C','E'
#define VAULT_R_VER      5u    // VAULT_REPORT_VER
#define VAULT_R_STATE    6u    // VAULT_STATE_* bits
#define VAULT_R_KEYLEN   7u    // 32
#define VAULT_R_SERIAL   8u    // 8 bytes, the RP2040's unique flash ID
#define VAULT_R_KEY     16u    // 32 bytes, zero while unprovisioned
#define VAULT_R_LABEL   48u    // 15 bytes, NUL padded

#define VAULT_STATE_PROVISIONED  0x01u
#define VAULT_STATE_SELECT_HELD  0x02u   // the presence chord is down right now
#define VAULT_STATE_WRITE_DENIED 0x04u   // the last SET was refused
#define VAULT_STATE_WRITE_OK     0x08u   // the last SET was stored

// SET report layout
#define VAULT_S_TAG      0u    // 'A','L','I','C','E'
#define VAULT_S_CMD      5u    // VAULT_CMD_*
#define VAULT_S_KEY      6u    // 32 bytes
#define VAULT_S_LABEL   38u    // 15 bytes

#define VAULT_CMD_STORE  1u
#define VAULT_CMD_ERASE  2u

// Beacon timing and levels.
#define VAULT_BEACON_SYMBOL_MS   50u
#define VAULT_BEACON_FRAME_BYTES 46u   // ver, state, serial[8], key[32], crc32
#define VAULT_BEACON_SYMBOLS     31u   // ceil(46 * 2 nibbles / 3 per symbol)
#define VAULT_BEACON_GAP_MS     250u
#define VAULT_BEACON_PERIOD_MS  (VAULT_BEACON_SYMBOLS * VAULT_BEACON_SYMBOL_MS + VAULT_BEACON_GAP_MS)
#define VAULT_BEACON_CENTER     0x80u
#define VAULT_BEACON_CLOCK_LO   0x30u
#define VAULT_BEACON_CLOCK_HI   0xD0u
#define VAULT_BEACON_LEVEL(n)   ((uint8_t) (8u + 16u * (n)))   // nibble n -> axis byte

typedef struct {
  bool    provisioned;
  uint8_t key[VAULT_KEY_LEN];
  uint8_t label[VAULT_LABEL_LEN];
  uint8_t serial[VAULT_SERIAL_LEN];
  uint8_t last_write;     // VAULT_STATE_WRITE_DENIED / _OK of the most recent SET, or 0
} vault_t;

typedef enum {
  VAULT_SET_IGNORED,   // not for us: wrong tag, unknown command, short report
  VAULT_SET_DENIED,    // provisioned and SELECT not held
  VAULT_SET_STORE,     // accepted: write vault_record() to flash
  VAULT_SET_ERASE,     // accepted: erase the sector
} vault_set_t;

/** An empty vault with the board's serial. */
void vault_init(vault_t *v, const uint8_t serial[VAULT_SERIAL_LEN]);

/** Load from the flash sector's bytes. False (and an empty vault) if no valid record. */
bool vault_load(vault_t *v, const uint8_t *record, size_t len);

/** The record to write to flash. Returns VAULT_RECORD_LEN, or 0 if `cap` is short. */
size_t vault_record(const vault_t *v, uint8_t *out, size_t cap);

/** Fill the GET feature report. Returns the bytes written (VAULT_REPORT_LEN), 0 if `cap` is short. */
size_t vault_report(const vault_t *v, bool select_held, uint8_t *out, size_t cap);

/**
 * Handle a SET feature report. On VAULT_SET_STORE the vault already holds
 * the new key; on VAULT_SET_ERASE it is already empty. The caller persists.
 */
vault_set_t vault_handle_set(vault_t *v, const uint8_t *buf, size_t len, bool select_held);

/**
 * The beacon's four stick bytes (lx, ly, rx, ry) at `t_ms` since the chord
 * went down. Returns false during the inter-frame gap (axes centred).
 */
bool vault_beacon_axes(const vault_t *v, uint32_t t_ms, uint8_t axes[4]);

/** The frame the beacon spells out, VAULT_BEACON_FRAME_BYTES long. */
void vault_beacon_frame(const vault_t *v, uint8_t out[VAULT_BEACON_FRAME_BYTES]);

/** CRC-32 (IEEE 802.3, the zlib one), for the record and the frame. */
uint32_t vault_crc32(const uint8_t *data, size_t len);

#endif /* VAULT_H_ */
