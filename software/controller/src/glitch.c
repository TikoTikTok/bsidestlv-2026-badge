/*
 * Quick glitch - record / replay engine. See glitch.h for the controls.
 *
 * Everything here is driven by rising edges of physical buttons while SELECT
 * is held, and by time. There is no interrupt, no timer callback: main.c
 * calls glitch_update() in its loop, several hundred times per millisecond,
 * and that is the replay resolution.
 */

#include "glitch.h"

#include <string.h>

// Playback speed table. Recorded time is multiplied by den / num, so entry 3
// (2/1) plays twice as fast and entry 0 (1/4) four times slower.
static const uint8_t k_speed[][2] = {
  { 1, 4 }, { 1, 2 }, { 1, 1 }, { 2, 1 }, { 4, 1 }, { 8, 1 }, { 16, 1 }, { 32, 1 },
};
#define SPEED_COUNT   ((uint8_t) (sizeof(k_speed) / sizeof(k_speed[0])))
#define SPEED_DEFAULT 2u

// Buttons that reach the recording. SELECT is the modifier, never recorded.
#define RECORDABLE   ((uint16_t) ~GLITCH_BTN_SELECT)

// Signed "has `t` passed?" that survives the 32-bit wrap.
static inline bool reached(uint32_t now, uint32_t t)
{
  return (int32_t) (now - t) >= 0;
}

void glitch_init(glitch_t *g)
{
  memset(g, 0, sizeof(*g));
  g->mode = GLITCH_IDLE;
  g->speed_index = SPEED_DEFAULT;
}

void glitch_speed(const glitch_t *g, uint8_t *num, uint8_t *den)
{
  *num = k_speed[g->speed_index][0];
  *den = k_speed[g->speed_index][1];
}

// Recorded time -> playback time at the current speed.
static uint32_t scaled(const glitch_t *g, uint32_t at_us)
{
  uint64_t t = (uint64_t) at_us * k_speed[g->speed_index][1] / k_speed[g->speed_index][0];
  return t > 0xFFFFFFFFu ? 0xFFFFFFFFu : (uint32_t) t;
}

uint32_t glitch_length_us(const glitch_t *g)
{
  return g->count ? scaled(g, g->events[g->count - 1].at_us) : 0;
}

//--------------------------------------------------------------------+
// Recording
//--------------------------------------------------------------------+

static void record_start(glitch_t *g)
{
  g->mode = GLITCH_RECORDING;
  g->count = 0;
  g->record_started = false;
  g->record_last = 0;
}

// The recording always ends with everything released, so a replay can never
// leave a button stuck down on the host. One slot is kept back for that.
static void record_stop(glitch_t *g)
{
  if (g->count && g->events[g->count - 1].buttons != 0 && g->count < GLITCH_MAX_EVENTS)
  {
    g->events[g->count].at_us   = g->events[g->count - 1].at_us + 1000u;
    g->events[g->count].buttons = 0;
    g->count++;
  }
  g->mode = GLITCH_IDLE;
}

static void record_sample(glitch_t *g, uint32_t now_us, uint16_t buttons)
{
  buttons &= RECORDABLE;
  if (buttons == g->record_last) return;

  // leading silence is not part of the take: the clock starts on the first press
  if (!g->record_started)
  {
    if (buttons == 0) return;
    g->record_started = true;
    g->record_t0_us = now_us;
  }

  g->events[g->count].at_us   = now_us - g->record_t0_us;
  g->events[g->count].buttons = buttons;
  g->count++;
  g->record_last = buttons;

  // full, keeping the slot the closing release needs
  if (g->count >= GLITCH_MAX_EVENTS - 1) record_stop(g);
}

//--------------------------------------------------------------------+
// Firing
//--------------------------------------------------------------------+

static void fire(glitch_t *g, uint32_t now_us)
{
  g->mode = GLITCH_FIRING;
  g->fire_t0_us = now_us;
  g->play_index = 0;
  g->play_mask = 0;
  g->repeat_pending = false;
}

// Advance the replay to `now_us` and return what it is holding down.
static uint16_t play_sample(glitch_t *g, uint32_t now_us)
{
  uint16_t out = 0;
  uint32_t t = now_us - g->fire_t0_us;

  if (t < GLITCH_TRIGGER_US) out |= GLITCH_BTN_TRIGGER;

  if (reached(now_us, g->fire_t0_us + g->offset_us))
  {
    uint32_t tm = t - g->offset_us;
    while (g->play_index < g->count && scaled(g, g->events[g->play_index].at_us) <= tm)
    {
      g->play_mask = g->events[g->play_index].buttons;
      g->play_index++;
    }
    out |= g->play_mask;
  }

  bool trigger_done = t >= GLITCH_TRIGGER_US;
  bool replay_done  = g->play_index >= g->count &&
                      reached(now_us, g->fire_t0_us + g->offset_us + glitch_length_us(g));
  if (trigger_done && replay_done)
  {
    g->mode = GLITCH_IDLE;
    g->play_mask = 0;
    g->repeat_pending = true;
    g->repeat_at_us = now_us + GLITCH_REPEAT_GAP_US;
  }
  return out;
}

//--------------------------------------------------------------------+
// Commands
//--------------------------------------------------------------------+

static void adjust_offset(glitch_t *g, uint16_t button, uint32_t step_us)
{
  if (button == GLITCH_BTN_RIGHT)
    g->offset_us = (g->offset_us + step_us > GLITCH_OFFSET_MAX_US) ? GLITCH_OFFSET_MAX_US
                                                                  : g->offset_us + step_us;
  else
    g->offset_us = (g->offset_us < step_us) ? 0 : g->offset_us - step_us;
}

static void command(glitch_t *g, uint32_t now_us, uint16_t button)
{
  switch (button)
  {
    case GLITCH_BTN_SL:
      if (g->mode == GLITCH_RECORDING)  record_stop(g);
      else if (g->mode == GLITCH_IDLE)  record_start(g);
      break;

    case GLITCH_BTN_SR:
      if (g->mode == GLITCH_IDLE) fire(g, now_us);
      break;

    case GLITCH_BTN_UP:
      if (g->speed_index + 1u < SPEED_COUNT) g->speed_index++;
      break;

    case GLITCH_BTN_DOWN:
      if (g->speed_index > 0) g->speed_index--;
      break;

    case GLITCH_BTN_LEFT:
    case GLITCH_BTN_RIGHT:
      adjust_offset(g, button, 1000u);
      g->adjust_button  = button;
      g->adjust_next_us = now_us + GLITCH_REPEAT_DELAY_US;
      g->adjust_steps   = 0;
      break;

    case GLITCH_BTN_B:
      if (g->mode == GLITCH_RECORDING) record_stop(g);
      g->count = 0;
      g->offset_us = 0;
      g->speed_index = SPEED_DEFAULT;
      break;

    default:
      break;
  }
}

//--------------------------------------------------------------------+
// The update
//--------------------------------------------------------------------+

uint16_t glitch_update(glitch_t *g, uint32_t now_us, uint16_t physical)
{
  const uint16_t rising  = physical & (uint16_t) ~g->prev_physical;
  const uint16_t falling = g->prev_physical & (uint16_t) ~physical;
  const bool select_held = physical & GLITCH_BTN_SELECT;
  g->prev_physical = physical;

  uint16_t out = 0;

  if (select_held)
  {
    // every rising edge under SELECT is a command, and nothing physical
    // reaches the host or the recording while the shift key is down
    uint16_t cmds = rising & (uint16_t) ~GLITCH_BTN_SELECT;
    for (uint16_t bit = 1; cmds; bit <<= 1)
    {
      if (!(cmds & bit)) continue;
      cmds &= (uint16_t) ~bit;
      g->select_used = true;
      command(g, now_us, bit);
    }

    // offset keys auto-repeat while held
    if (g->adjust_button && (physical & g->adjust_button))
    {
      if (reached(now_us, g->adjust_next_us))
      {
        g->adjust_steps++;
        adjust_offset(g, g->adjust_button,
                      g->adjust_steps > GLITCH_COARSE_AFTER ? 10000u : 1000u);
        g->adjust_next_us += GLITCH_REPEAT_RATE_US;
      }
    }
    else
    {
      g->adjust_button = 0;
    }

    // the fire chord held down refires once the previous run has settled
    if (g->repeat_pending && (physical & GLITCH_BTN_SR) && g->mode == GLITCH_IDLE)
    {
      if (reached(now_us, g->repeat_at_us)) fire(g, now_us);
    }
    else if (!(physical & GLITCH_BTN_SR))
    {
      g->repeat_pending = false;
    }
  }
  else
  {
    g->adjust_button = 0;
    g->repeat_pending = false;

    if (falling & GLITCH_BTN_SELECT)
    {
      // a bare SELECT press: forward it now as a tap, since the host saw
      // nothing while it was held
      if (!g->select_used)
      {
        g->select_tap_pending = true;
        g->select_tap_until_us = now_us + GLITCH_SELECT_TAP_US;
      }
      g->select_used = false;
    }

    out |= physical & RECORDABLE;
    if (g->mode == GLITCH_RECORDING) record_sample(g, now_us, physical);
  }

  if (g->mode == GLITCH_FIRING) out |= play_sample(g, now_us);

  if (g->select_tap_pending)
  {
    if (reached(now_us, g->select_tap_until_us)) g->select_tap_pending = false;
    else out |= GLITCH_BTN_SELECT;
  }

  return out;
}
