/*
 * The vault - see vault.h. Pure C: the record, the two feature reports and
 * the beacon are all plain functions of the vault and the clock.
 */

#include "vault.h"

#include <string.h>

uint32_t vault_crc32(const uint8_t *data, size_t len)
{
  uint32_t crc = 0xFFFFFFFFu;
  for (size_t i = 0; i < len; i++)
  {
    crc ^= data[i];
    for (int b = 0; b < 8; b++) crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
  }
  return ~crc;
}

static void put_u32le(uint8_t *p, uint32_t v)
{
  p[0] = (uint8_t) v; p[1] = (uint8_t) (v >> 8); p[2] = (uint8_t) (v >> 16); p[3] = (uint8_t) (v >> 24);
}

static uint32_t get_u32le(const uint8_t *p)
{
  return (uint32_t) p[0] | ((uint32_t) p[1] << 8) | ((uint32_t) p[2] << 16) | ((uint32_t) p[3] << 24);
}

//--------------------------------------------------------------------+
// The record
//--------------------------------------------------------------------+
// magic[4] flags[1] label[15] key[32] pad[4] crc[4] = 60 bytes

#define REC_MAGIC   0u
#define REC_FLAGS   4u
#define REC_LABEL   5u
#define REC_KEY    20u
#define REC_PAD    52u
#define REC_CRC    56u

void vault_init(vault_t *v, const uint8_t serial[VAULT_SERIAL_LEN])
{
  memset(v, 0, sizeof(*v));
  memcpy(v->serial, serial, VAULT_SERIAL_LEN);
}

bool vault_load(vault_t *v, const uint8_t *record, size_t len)
{
  uint8_t serial[VAULT_SERIAL_LEN];
  memcpy(serial, v->serial, sizeof(serial));
  vault_init(v, serial);

  if (len < VAULT_RECORD_LEN) return false;
  if (memcmp(record + REC_MAGIC, VAULT_MAGIC, 4) != 0) return false;
  if (vault_crc32(record, REC_CRC) != get_u32le(record + REC_CRC)) return false;
  if (!(record[REC_FLAGS] & VAULT_FLAG_PROVISIONED)) return false;

  v->provisioned = true;
  memcpy(v->key, record + REC_KEY, VAULT_KEY_LEN);
  memcpy(v->label, record + REC_LABEL, VAULT_LABEL_LEN);
  return true;
}

size_t vault_record(const vault_t *v, uint8_t *out, size_t cap)
{
  if (cap < VAULT_RECORD_LEN) return 0;
  memset(out, 0, VAULT_RECORD_LEN);
  memcpy(out + REC_MAGIC, VAULT_MAGIC, 4);
  out[REC_FLAGS] = v->provisioned ? VAULT_FLAG_PROVISIONED : 0;
  memcpy(out + REC_LABEL, v->label, VAULT_LABEL_LEN);
  memcpy(out + REC_KEY, v->key, VAULT_KEY_LEN);
  put_u32le(out + REC_CRC, vault_crc32(out, REC_CRC));
  return VAULT_RECORD_LEN;
}

//--------------------------------------------------------------------+
// Feature report 0xF1
//--------------------------------------------------------------------+

size_t vault_report(const vault_t *v, bool select_held, uint8_t *out, size_t cap)
{
  if (cap < VAULT_REPORT_LEN) return 0;
  memset(out, 0, VAULT_REPORT_LEN);
  memcpy(out + VAULT_R_TAG, VAULT_REPORT_TAG, 5);
  out[VAULT_R_VER]    = VAULT_REPORT_VER;
  out[VAULT_R_STATE]  = (uint8_t) ((v->provisioned ? VAULT_STATE_PROVISIONED : 0)
                                 | (select_held ? VAULT_STATE_SELECT_HELD : 0)
                                 | v->last_write);
  out[VAULT_R_KEYLEN] = VAULT_KEY_LEN;
  memcpy(out + VAULT_R_SERIAL, v->serial, VAULT_SERIAL_LEN);
  if (v->provisioned)
  {
    memcpy(out + VAULT_R_KEY, v->key, VAULT_KEY_LEN);
    memcpy(out + VAULT_R_LABEL, v->label, VAULT_LABEL_LEN);
  }
  return VAULT_REPORT_LEN;
}

vault_set_t vault_handle_set(vault_t *v, const uint8_t *buf, size_t len, bool select_held)
{
  if (len < VAULT_S_LABEL + VAULT_LABEL_LEN) return VAULT_SET_IGNORED;
  if (memcmp(buf + VAULT_S_TAG, VAULT_REPORT_TAG, 5) != 0) return VAULT_SET_IGNORED;

  const uint8_t cmd = buf[VAULT_S_CMD];
  if (cmd != VAULT_CMD_STORE && cmd != VAULT_CMD_ERASE) return VAULT_SET_IGNORED;

  // Physical presence: a badge that already has a key gives it up only to
  // someone holding it. A blank one takes its first key as it is.
  if (v->provisioned && !select_held)
  {
    v->last_write = VAULT_STATE_WRITE_DENIED;
    return VAULT_SET_DENIED;
  }

  v->last_write = VAULT_STATE_WRITE_OK;
  if (cmd == VAULT_CMD_ERASE)
  {
    v->provisioned = false;
    memset(v->key, 0, sizeof(v->key));
    memset(v->label, 0, sizeof(v->label));
    return VAULT_SET_ERASE;
  }

  // an all-zero key is "no key": refuse it rather than store a blank
  bool any = false;
  for (size_t i = 0; i < VAULT_KEY_LEN; i++) any |= buf[VAULT_S_KEY + i] != 0;
  if (!any)
  {
    v->last_write = VAULT_STATE_WRITE_DENIED;
    return VAULT_SET_DENIED;
  }

  v->provisioned = true;
  memcpy(v->key, buf + VAULT_S_KEY, VAULT_KEY_LEN);
  memcpy(v->label, buf + VAULT_S_LABEL, VAULT_LABEL_LEN);   // bytes, NUL padded, never a C string
  return VAULT_SET_STORE;
}

//--------------------------------------------------------------------+
// The beacon
//--------------------------------------------------------------------+
// frame: ver[1] state[1] serial[8] key[32] crc32[4] = 46 bytes = 92 nibbles,
// high nibble first. Symbol k carries nibbles 3k, 3k+1, 3k+2 on ly, rx, ry
// and the clock on lx; the 93rd nibble is padding.

void vault_beacon_frame(const vault_t *v, uint8_t out[VAULT_BEACON_FRAME_BYTES])
{
  out[0] = VAULT_REPORT_VER;
  out[1] = v->provisioned ? VAULT_STATE_PROVISIONED : 0;
  memcpy(out + 2, v->serial, VAULT_SERIAL_LEN);
  memcpy(out + 10, v->key, VAULT_KEY_LEN);
  put_u32le(out + 42, vault_crc32(out, 42));
}

static uint8_t nibble_at(const uint8_t *frame, unsigned i)
{
  if (i >= VAULT_BEACON_FRAME_BYTES * 2u) return 0;   // padding
  uint8_t b = frame[i / 2u];
  return (i & 1u) ? (uint8_t) (b & 0x0Fu) : (uint8_t) (b >> 4);
}

bool vault_beacon_axes(const vault_t *v, uint32_t t_ms, uint8_t axes[4])
{
  const uint32_t in_period = t_ms % VAULT_BEACON_PERIOD_MS;
  const uint32_t symbol = in_period / VAULT_BEACON_SYMBOL_MS;

  if (symbol >= VAULT_BEACON_SYMBOLS)
  {
    axes[0] = axes[1] = axes[2] = axes[3] = VAULT_BEACON_CENTER;
    return false;
  }

  uint8_t frame[VAULT_BEACON_FRAME_BYTES];
  vault_beacon_frame(v, frame);

  axes[0] = (symbol & 1u) ? VAULT_BEACON_CLOCK_HI : VAULT_BEACON_CLOCK_LO;
  axes[1] = VAULT_BEACON_LEVEL(nibble_at(frame, symbol * 3u));
  axes[2] = VAULT_BEACON_LEVEL(nibble_at(frame, symbol * 3u + 1u));
  axes[3] = VAULT_BEACON_LEVEL(nibble_at(frame, symbol * 3u + 2u));
  return true;
}
