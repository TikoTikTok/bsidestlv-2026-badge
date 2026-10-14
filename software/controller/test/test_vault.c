/*
 * Host-side tests for the vault: the flash record survives a round trip and
 * rejects damage, the feature reports say what vault.h promises, writes are
 * gated by SELECT, and the beacon decodes back to the frame it spells out
 * when sampled the way a browser samples a gamepad (every 16.7 ms, from an
 * arbitrary phase).
 *
 *   make -C software/controller/test
 */

#include <stdio.h>
#include <string.h>

#include "../src/vault.h"

static int failures;

#define CHECK(cond, ...) do { if (!(cond)) { failures++; \
  printf("  FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static const uint8_t SERIAL[8] = { 0xE6, 0x60, 0x58, 0x38, 0x83, 0x4B, 0x5A, 0x2E };

static void fill_key(uint8_t key[32])
{
  for (int i = 0; i < 32; i++) key[i] = (uint8_t) (i * 7 + 3);
}

// A SET report that stores `key` under `label`.
static void set_report(uint8_t buf[VAULT_REPORT_LEN], uint8_t cmd, const uint8_t *key, const char *label)
{
  memset(buf, 0, VAULT_REPORT_LEN);
  memcpy(buf + VAULT_S_TAG, VAULT_REPORT_TAG, 5);
  buf[VAULT_S_CMD] = cmd;
  if (key) memcpy(buf + VAULT_S_KEY, key, VAULT_KEY_LEN);
  if (label) strncpy((char *) buf + VAULT_S_LABEL, label, VAULT_LABEL_LEN);
}

//--------------------------------------------------------------------+

static void test_crc(void)
{
  // the zlib test vector: crc32("123456789") = 0xCBF43926
  CHECK(vault_crc32((const uint8_t *) "123456789", 9) == 0xCBF43926u, "crc32 check value");
  CHECK(vault_crc32((const uint8_t *) "", 0) == 0u, "crc32 of nothing is 0");
}

static void test_record_round_trip(void)
{
  vault_t v, w;
  uint8_t key[32], rec[VAULT_RECORD_LEN], buf[VAULT_REPORT_LEN];
  fill_key(key);

  vault_init(&v, SERIAL);
  CHECK(!v.provisioned, "fresh vault is empty");

  set_report(buf, VAULT_CMD_STORE, key, "bsidestlv26");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), false) == VAULT_SET_STORE, "blank badge takes its first key");
  CHECK(v.provisioned && memcmp(v.key, key, 32) == 0, "key stored");
  CHECK(memcmp(v.label, "bsidestlv26\0\0\0\0", VAULT_LABEL_LEN) == 0, "label stored, NUL padded");

  CHECK(vault_record(&v, rec, sizeof(rec)) == VAULT_RECORD_LEN, "record written");
  CHECK(vault_record(&v, rec, 10) == 0, "short buffer refused");
  CHECK(memcmp(rec, "VLT1", 4) == 0, "record magic");

  vault_init(&w, SERIAL);
  CHECK(vault_load(&w, rec, sizeof(rec)), "record loads");
  CHECK(w.provisioned && memcmp(w.key, key, 32) == 0 && memcmp(w.label, v.label, VAULT_LABEL_LEN) == 0,
        "record round trip");
  CHECK(memcmp(w.serial, SERIAL, 8) == 0, "serial survives a load");

  // damage: one bit in the key
  rec[25] ^= 0x10;
  CHECK(!vault_load(&w, rec, sizeof(rec)) && !w.provisioned, "corrupt record rejected and vault emptied");
  rec[25] ^= 0x10;

  // an erased sector reads as 0xFF
  uint8_t blank[VAULT_RECORD_LEN];
  memset(blank, 0xFF, sizeof(blank));
  CHECK(!vault_load(&w, blank, sizeof(blank)), "erased flash is no record");
  CHECK(!vault_load(&w, rec, 20), "short record rejected");
}

static void test_reports(void)
{
  vault_t v;
  uint8_t key[32], buf[VAULT_REPORT_LEN], rep[VAULT_REPORT_LEN];
  fill_key(key);
  vault_init(&v, SERIAL);

  CHECK(vault_report(&v, false, rep, sizeof(rep)) == VAULT_REPORT_LEN, "GET fills 63 bytes");
  CHECK(vault_report(&v, false, rep, 62) == 0, "GET refuses a short buffer");
  CHECK(memcmp(rep, "ALICE", 5) == 0 && rep[VAULT_R_VER] == 1, "GET tag and version");
  CHECK(rep[VAULT_R_STATE] == 0, "blank badge: state 0");
  CHECK(rep[VAULT_R_KEYLEN] == 32, "GET says 32-byte key");
  CHECK(memcmp(rep + VAULT_R_SERIAL, SERIAL, 8) == 0, "GET carries the serial");
  for (int i = 0; i < 32; i++) CHECK(rep[VAULT_R_KEY + i] == 0, "blank badge: key bytes are zero");

  // SELECT held shows in the state even when nothing was written
  vault_report(&v, true, rep, sizeof(rep));
  CHECK(rep[VAULT_R_STATE] == VAULT_STATE_SELECT_HELD, "state reports the chord");

  set_report(buf, VAULT_CMD_STORE, key, "lab");
  vault_handle_set(&v, buf, sizeof(buf), false);
  vault_report(&v, false, rep, sizeof(rep));
  CHECK(rep[VAULT_R_STATE] == (VAULT_STATE_PROVISIONED | VAULT_STATE_WRITE_OK), "state after a store");
  CHECK(memcmp(rep + VAULT_R_KEY, key, 32) == 0, "GET carries the key");
  CHECK(memcmp(rep + VAULT_R_LABEL, "lab\0", 4) == 0, "GET carries the label");
}

static void test_write_policy(void)
{
  vault_t v;
  uint8_t key[32], other[32], buf[VAULT_REPORT_LEN];
  fill_key(key);
  for (int i = 0; i < 32; i++) other[i] = (uint8_t) (0xA0 + i);
  vault_init(&v, SERIAL);

  // not ours: wrong tag, unknown command, too short
  set_report(buf, VAULT_CMD_STORE, key, "x");
  buf[0] = 'B';
  CHECK(vault_handle_set(&v, buf, sizeof(buf), true) == VAULT_SET_IGNORED, "wrong tag ignored");
  set_report(buf, 9, key, "x");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), true) == VAULT_SET_IGNORED, "unknown command ignored");
  set_report(buf, VAULT_CMD_STORE, key, "x");
  CHECK(vault_handle_set(&v, buf, 20, true) == VAULT_SET_IGNORED, "short report ignored");
  CHECK(!v.provisioned && v.last_write == 0, "ignored reports change nothing");

  // an all-zero key is not a key
  set_report(buf, VAULT_CMD_STORE, NULL, "zero");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), true) == VAULT_SET_DENIED, "zero key refused");
  CHECK(!v.provisioned && v.last_write == VAULT_STATE_WRITE_DENIED, "refusal is reported");

  // first key: no chord needed
  set_report(buf, VAULT_CMD_STORE, key, "first");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), false) == VAULT_SET_STORE, "first key, no chord");

  // second key: chord needed
  set_report(buf, VAULT_CMD_STORE, other, "second");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), false) == VAULT_SET_DENIED, "re-key without SELECT denied");
  CHECK(memcmp(v.key, key, 32) == 0 && v.last_write == VAULT_STATE_WRITE_DENIED, "denied re-key keeps the old key");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), true) == VAULT_SET_STORE, "re-key with SELECT stored");
  CHECK(memcmp(v.key, other, 32) == 0, "new key in place");

  // erase: same rule
  set_report(buf, VAULT_CMD_ERASE, NULL, NULL);
  CHECK(vault_handle_set(&v, buf, sizeof(buf), false) == VAULT_SET_DENIED, "erase without SELECT denied");
  CHECK(v.provisioned, "denied erase keeps the key");
  CHECK(vault_handle_set(&v, buf, sizeof(buf), true) == VAULT_SET_ERASE, "erase with SELECT");
  CHECK(!v.provisioned, "erased");
  for (int i = 0; i < 32; i++) CHECK(v.key[i] == 0, "erased key is zero");
  uint8_t rep[VAULT_REPORT_LEN];
  vault_report(&v, false, rep, sizeof(rep));
  CHECK(rep[VAULT_R_STATE] == VAULT_STATE_WRITE_OK, "state after an erase");
}

//--------------------------------------------------------------------+
// The beacon, decoded the way src/vault.js decodes it
//--------------------------------------------------------------------+

// What a browser hands a page: the byte normalised to -1..1 and back.
static double normalise(uint8_t b) { return b / 127.5 - 1.0; }
static int denormalise(double v)   { return (int) ((v + 1.0) * 127.5 + 0.5); }

typedef struct {
  int    clock;            // -1 centre, 0 low, 1 high
  uint8_t nibbles[VAULT_BEACON_SYMBOLS * 3];
  int    count;
  int    bad;
  uint8_t frames[4][VAULT_BEACON_FRAME_BYTES];
  int    nframes;
} decoder_t;

static int classify_clock(int b)
{
  if (b < 88) return 0;
  if (b > 168) return 1;
  return -1;
}

static int nibble_of(int b, int *bad)
{
  int n = (int) ((b - 8) / 16.0 + 0.5);
  if (n < 0 || n > 15 || b - (8 + 16 * n) > 5 || (8 + 16 * n) - b > 5) { (*bad)++; return 0; }
  return n;
}

static void decoder_close(decoder_t *d)
{
  if (d->count == VAULT_BEACON_SYMBOLS * 3 && !d->bad)
  {
    uint8_t frame[VAULT_BEACON_FRAME_BYTES];
    for (unsigned i = 0; i < VAULT_BEACON_FRAME_BYTES; i++)
      frame[i] = (uint8_t) ((d->nibbles[2 * i] << 4) | d->nibbles[2 * i + 1]);
    uint32_t crc = (uint32_t) frame[42] | ((uint32_t) frame[43] << 8) | ((uint32_t) frame[44] << 16) | ((uint32_t) frame[45] << 24);
    if (crc == vault_crc32(frame, 42) && d->nframes < 4) memcpy(d->frames[d->nframes++], frame, sizeof(frame));
  }
  d->count = 0;
  d->bad = 0;
  d->clock = -1;
}

static void decoder_sample(decoder_t *d, const double axes[4])
{
  int clock = classify_clock(denormalise(axes[0]));
  if (clock == d->clock) return;
  if (clock == -1) { decoder_close(d); return; }
  if (d->clock == -1) { d->count = 0; d->bad = 0; }
  d->clock = clock;
  if (d->count + 3 > (int) sizeof(d->nibbles)) { d->bad++; return; }
  for (int a = 1; a < 4; a++) d->nibbles[d->count++] = (uint8_t) nibble_of(denormalise(axes[a]), &d->bad);
}

// Sample the badge every `step_ms` from `phase_ms`, over `total_ms`.
static int decode_run(const vault_t *v, double step_ms, double phase_ms, uint32_t total_ms, decoder_t *d)
{
  memset(d, 0, sizeof(*d));
  d->clock = -1;
  for (double t = phase_ms; t < total_ms; t += step_ms)
  {
    uint8_t axes[4];
    vault_beacon_axes(v, (uint32_t) t, axes);
    double f[4];
    for (int i = 0; i < 4; i++) f[i] = normalise(axes[i]);
    decoder_sample(d, f);
  }
  return d->nframes;
}

static void test_beacon(void)
{
  vault_t v;
  uint8_t key[32], buf[VAULT_REPORT_LEN], axes[4], frame[VAULT_BEACON_FRAME_BYTES];
  fill_key(key);
  vault_init(&v, SERIAL);
  set_report(buf, VAULT_CMD_STORE, key, "beacon");
  vault_handle_set(&v, buf, sizeof(buf), false);

  vault_beacon_frame(&v, frame);
  CHECK(frame[0] == 1 && frame[1] == VAULT_STATE_PROVISIONED, "frame header");
  CHECK(memcmp(frame + 2, SERIAL, 8) == 0 && memcmp(frame + 10, key, 32) == 0, "frame body");

  // symbol 0 carries the first three nibbles: 0x01 -> 0, 1; 0x01 (state) -> 0
  CHECK(vault_beacon_axes(&v, 0, axes), "symbol 0 is live");
  CHECK(axes[0] == VAULT_BEACON_CLOCK_LO, "clock starts low");
  CHECK(axes[1] == VAULT_BEACON_LEVEL(0) && axes[2] == VAULT_BEACON_LEVEL(1) && axes[3] == VAULT_BEACON_LEVEL(0),
        "symbol 0 nibbles: %02x %02x %02x", axes[1], axes[2], axes[3]);
  // symbol 1: nibbles 3,4,5 = low of state (1), high/low of serial[0] 0xE6 -> 14, 6
  vault_beacon_axes(&v, 50, axes);
  CHECK(axes[0] == VAULT_BEACON_CLOCK_HI, "clock flips each symbol");
  CHECK(axes[1] == VAULT_BEACON_LEVEL(1) && axes[2] == VAULT_BEACON_LEVEL(14) && axes[3] == VAULT_BEACON_LEVEL(6),
        "symbol 1 nibbles: %02x %02x %02x", axes[1], axes[2], axes[3]);
  // the frame's last symbol then the gap
  CHECK(vault_beacon_axes(&v, 30 * 50 + 49, axes), "symbol 30 is live");
  CHECK(!vault_beacon_axes(&v, 31 * 50, axes), "then the gap");
  CHECK(axes[0] == 0x80 && axes[1] == 0x80 && axes[2] == 0x80 && axes[3] == 0x80, "gap is centred");
  CHECK(vault_beacon_axes(&v, VAULT_BEACON_PERIOD_MS, axes) && axes[0] == VAULT_BEACON_CLOCK_LO, "frame repeats");

  // a browser sampling at 60 Hz from any phase decodes the frame in two periods
  for (double phase = 0; phase < 50; phase += 7.3)
  {
    decoder_t d;
    int n = decode_run(&v, 1000.0 / 60.0, phase, 2 * VAULT_BEACON_PERIOD_MS + 100, &d);
    CHECK(n >= 1, "60 Hz, phase %.1f ms: %d frames", phase, n);
    if (n) CHECK(memcmp(d.frames[0], frame, sizeof(frame)) == 0, "60 Hz, phase %.1f ms: frame matches", phase);
  }
  // and at a lazy 30 Hz, and a fast 250 Hz
  {
    decoder_t d;
    CHECK(decode_run(&v, 1000.0 / 30.0, 3, 2 * VAULT_BEACON_PERIOD_MS + 100, &d) >= 1, "30 Hz decodes");
    CHECK(decode_run(&v, 4, 1, 2 * VAULT_BEACON_PERIOD_MS + 100, &d) >= 1, "250 Hz decodes");
    CHECK(d.nframes && memcmp(d.frames[0], frame, sizeof(frame)) == 0, "250 Hz frame matches");
  }
  // a blank badge still beacons: its serial, a zero key, state 0
  {
    vault_t blank;
    decoder_t d;
    vault_init(&blank, SERIAL);
    CHECK(decode_run(&blank, 1000.0 / 60.0, 0, 2 * VAULT_BEACON_PERIOD_MS, &d) >= 1, "blank badge beacons");
    CHECK(d.nframes && d.frames[0][1] == 0 && d.frames[0][10] == 0, "blank frame says unprovisioned");
  }
}

int main(void)
{
  test_crc();
  test_record_round_trip();
  test_reports();
  test_write_policy();
  test_beacon();

  if (failures) { printf("vault: %d failure(s)\n", failures); return 1; }
  printf("vault: all tests passed\n");
  return 0;
}
