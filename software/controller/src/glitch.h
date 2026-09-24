#ifndef GLITCH_H_
#define GLITCH_H_

/*
 * Quick glitch - a record / replay layer between the buttons and the host.
 *
 * The badge is a controller, but it is also a fault-injection trainer: the
 * challenge site has a range where the only way through is to land an input
 * inside a window no human hand can hit. This module is the glitcher. It
 * records a short sequence of button presses with microsecond timestamps and
 * plays it back on demand, scaled by a speed factor and delayed by an offset
 * measured from a trigger the host can see.
 *
 * The vocabulary is borrowed from real glitching gear - trigger, offset,
 * width, repeat - because that is what the range is teaching.
 *
 * Pure C, no SDK: the caller feeds it (time, physical buttons) and gets back
 * the buttons to report. software/controller/test/ builds it on a PC.
 *
 * SELECT is the shift key. While it is held nothing physical reaches the host,
 * and each other button is a command:
 *
 *   SELECT + SL       start / stop recording
 *   SELECT + SR       fire: a START tap, then the recording after `offset`.
 *                     Hold the chord and it fires again every ~600 ms.
 *   SELECT + UP/DOWN  playback speed x2 / /2, from 1/4x to 32x
 *   SELECT + LEFT/RIGHT  offset -/+ 1 ms; hold to auto-repeat, and after
 *                     twenty steps the step grows to 10 ms
 *   SELECT + B        forget the recording, offset 0, speed 1x
 *
 * A plain SELECT press - held and released with no command - still reaches
 * the host as a short tap on release, so the button keeps working as Share.
 */

#include <stdbool.h>
#include <stdint.h>

// One bit per physical button. The order is arbitrary but fixed: the host
// tests and main.c both build masks from these.
#define GLITCH_BTN_UP      (1u << 0)
#define GLITCH_BTN_DOWN    (1u << 1)
#define GLITCH_BTN_LEFT    (1u << 2)
#define GLITCH_BTN_RIGHT   (1u << 3)
#define GLITCH_BTN_A       (1u << 4)
#define GLITCH_BTN_B       (1u << 5)
#define GLITCH_BTN_X       (1u << 6)
#define GLITCH_BTN_Y       (1u << 7)
#define GLITCH_BTN_SL      (1u << 8)
#define GLITCH_BTN_SR      (1u << 9)
#define GLITCH_BTN_START   (1u << 10)
#define GLITCH_BTN_SELECT  (1u << 11)

// The button the fire command taps first, so the host has a t=0 to measure
// the offset from. START, because no game binds it to anything mid-level.
#define GLITCH_BTN_TRIGGER  GLITCH_BTN_START

#define GLITCH_MAX_EVENTS   128

// Timing constants, in microseconds.
#define GLITCH_TRIGGER_US        30000u   // how long the trigger tap is held
#define GLITCH_SELECT_TAP_US     40000u   // the deferred plain-SELECT tap
#define GLITCH_REPEAT_GAP_US    600000u   // pause between held-chord refires
#define GLITCH_REPEAT_DELAY_US  350000u   // offset keys: first auto-repeat
#define GLITCH_REPEAT_RATE_US    60000u   // offset keys: then every
#define GLITCH_COARSE_AFTER          20u  // offset keys: steps before 10 ms
#define GLITCH_OFFSET_MAX_US  10000000u   // 10 s is more than any level needs

typedef enum {
  GLITCH_IDLE,        // pass-through
  GLITCH_RECORDING,   // pass-through, and remembering every change
  GLITCH_FIRING,      // trigger tap, wait for the offset, replay
} glitch_mode_t;

typedef struct {
  uint32_t at_us;     // relative to the first recorded change
  uint16_t buttons;   // the full button state from this moment on
} glitch_event_t;

typedef struct {
  glitch_mode_t mode;

  glitch_event_t events[GLITCH_MAX_EVENTS];
  uint16_t count;

  uint8_t  speed_index;   // into the speed table, see glitch_speed()
  uint32_t offset_us;     // trigger rising edge -> first replayed event

  // --- internal ---
  uint16_t prev_physical;
  bool     select_used;          // a command fired during this SELECT hold
  uint32_t select_tap_until_us;  // deferred plain-SELECT tap, if pending
  bool     select_tap_pending;

  bool     record_started;
  uint32_t record_t0_us;
  uint16_t record_last;

  uint32_t fire_t0_us;
  uint16_t play_index;
  uint16_t play_mask;
  bool     repeat_pending;
  uint32_t repeat_at_us;

  uint16_t adjust_button;        // LEFT or RIGHT being auto-repeated, or 0
  uint32_t adjust_next_us;
  uint16_t adjust_steps;
} glitch_t;

void glitch_init(glitch_t *g);

/**
 * Feed the current physical buttons and get back the buttons to report.
 * Call it as often as possible; the replay resolution is the call rate.
 * `now_us` may wrap, differences are what matter.
 */
uint16_t glitch_update(glitch_t *g, uint32_t now_us, uint16_t physical);

/** Playback speed as a fraction: recorded time * den / num. */
void glitch_speed(const glitch_t *g, uint8_t *num, uint8_t *den);

/** Total replay length at the current speed, offset excluded. 0 if empty. */
uint32_t glitch_length_us(const glitch_t *g);

#endif /* GLITCH_H_ */
