/*
 * BSidesTLV2026 Alice Controller - a USB HID game controller for the Raspberry Pi Pico.
 *
 * Mimics a Game Boy Color button layout (D-pad + A/B + START/SELECT) and
 * presents itself to a host as a wired DualShock 4.
 *
 * A generic HID gamepad works on Android, PC and Linux but is invisible on
 * iOS/iPadOS: Apple's GameController framework only attaches to controllers
 * it recognises by USB VID/PID. Speaking the DualShock 4's identity and
 * input report gets an iPhone to bind a real controller profile, and the
 * same descriptor is understood everywhere else too.
 *
 * Wiring (all buttons are active-low, i.e. wired to GND, using the internal
 * pull-ups - external pull-ups are also fine):
 *
 *   GPIO0  -> D-pad DOWN
 *   GPIO1  -> D-pad RIGHT
 *   GPIO2  -> D-pad UP
 *   GPIO3  -> D-pad LEFT
 *   GPIO4  -> B
 *   GPIO5  -> A
 *   GPIO20 -> X
 *   GPIO21 -> Y
 *   GPIO22 -> SR (right shoulder)
 *   GPIO25 -> SL (left shoulder)
 *   GPIO23 -> START
 *   GPIO24 -> SELECT
 *   GPIO8  -> status LED (active-high)
 *
 * Between the buttons and the USB report sits the quick-glitch layer
 * (glitch.c): SELECT is a shift key that records a take of button presses
 * and replays it, scaled and delayed, on command. See glitch.h.
 */

#include <string.h>

#include "pico/stdlib.h"
#include "tusb.h"

#include "usb_descriptors.h"
#include "ds4.h"
#include "glitch.h"

//--------------------------------------------------------------------+
// Pin configuration
//--------------------------------------------------------------------+

#define PIN_DOWN    0u
#define PIN_RIGHT   1u
#define PIN_UP      2u
#define PIN_LEFT    3u
#define PIN_B       4u
#define PIN_A       5u
#define PIN_X       20u
#define PIN_Y       21u
#define PIN_SR      22u
#define PIN_SL      25u
#define PIN_START   23u
#define PIN_SELECT  24u

#define PIN_LED     8u

// All face/dpad buttons used by the controller, so we can init them in a loop.
static const uint8_t k_button_pins[] = {
  PIN_DOWN, PIN_RIGHT, PIN_UP, PIN_LEFT,
  PIN_B, PIN_A, PIN_X, PIN_Y, PIN_SR, PIN_SL, PIN_START, PIN_SELECT,
};

// Buttons are active-low (pressed == logic 0 thanks to the pull-up).
static inline bool button_pressed(uint8_t pin)
{
  return !gpio_get(pin);
}

// Every button as one glitch_t mask, read in a single pass.
static uint16_t read_buttons(void)
{
  uint16_t m = 0;
  if (button_pressed(PIN_UP))     m |= GLITCH_BTN_UP;
  if (button_pressed(PIN_DOWN))   m |= GLITCH_BTN_DOWN;
  if (button_pressed(PIN_LEFT))   m |= GLITCH_BTN_LEFT;
  if (button_pressed(PIN_RIGHT))  m |= GLITCH_BTN_RIGHT;
  if (button_pressed(PIN_A))      m |= GLITCH_BTN_A;
  if (button_pressed(PIN_B))      m |= GLITCH_BTN_B;
  if (button_pressed(PIN_X))      m |= GLITCH_BTN_X;
  if (button_pressed(PIN_Y))      m |= GLITCH_BTN_Y;
  if (button_pressed(PIN_SL))     m |= GLITCH_BTN_SL;
  if (button_pressed(PIN_SR))     m |= GLITCH_BTN_SR;
  if (button_pressed(PIN_START))  m |= GLITCH_BTN_START;
  if (button_pressed(PIN_SELECT)) m |= GLITCH_BTN_SELECT;
  return m;
}

//--------------------------------------------------------------------+
// Quick glitch
//--------------------------------------------------------------------+

static glitch_t glitch;

// What the host should see. The engine runs every loop iteration, far faster
// than reports go out, so a replayed press shorter than one report interval
// would fall between two reports and vanish. Instead every button that was
// down at any moment since the last report is latched into the next one: a
// 300 us pulse still shows up as one report's worth of "pressed".
static uint16_t latched_buttons = 0;

static void glitch_task(void)
{
  uint16_t out = glitch_update(&glitch, time_us_32(), read_buttons());
  latched_buttons |= out;
}

//--------------------------------------------------------------------+
// Status LED
//--------------------------------------------------------------------+

// Blink intervals (ms) signalling the USB connection state.
enum {
  BLINK_NOT_MOUNTED = 250,
  BLINK_SUSPENDED   = 1000,
  BLINK_RECORDING   = 100,   // quick glitch: a take is being recorded
};

// 0 means "don't blink, let the application drive the LED directly".
static uint32_t blink_interval_ms = BLINK_NOT_MOUNTED;

static inline uint32_t now_ms(void)
{
  return to_ms_since_boot(get_absolute_time());
}

static void board_setup(void)
{
  for ( size_t i = 0; i < sizeof(k_button_pins) / sizeof(k_button_pins[0]); i++ )
  {
    uint8_t pin = k_button_pins[i];
    gpio_init(pin);
    gpio_set_dir(pin, GPIO_IN);
    // gpio_pull_up(pin);
  }

  gpio_init(PIN_LED);
  gpio_set_dir(PIN_LED, GPIO_OUT);
  gpio_put(PIN_LED, 0);
}

//--------------------------------------------------------------------+
// USB device callbacks
//--------------------------------------------------------------------+

void tud_mount_cb(void)
{
  blink_interval_ms = 0; // application now controls the LED
}

void tud_umount_cb(void)
{
  blink_interval_ms = BLINK_NOT_MOUNTED;
}

void tud_suspend_cb(bool remote_wakeup_en)
{
  (void) remote_wakeup_en;
  blink_interval_ms = BLINK_SUSPENDED;
}

void tud_resume_cb(void)
{
  blink_interval_ms = tud_mounted() ? 0 : BLINK_NOT_MOUNTED;
}

//--------------------------------------------------------------------+
// DualShock 4 input report
//--------------------------------------------------------------------+

static uint8_t compute_hat(bool up, bool down, bool left, bool right)
{
  // Opposite directions cancel out so we never report an impossible diagonal.
  if (up && down)    { up = down = false; }
  if (left && right) { left = right = false; }

  if (up && right)   return DS4_HAT_NE;
  if (up && left)    return DS4_HAT_NW;
  if (down && right) return DS4_HAT_SE;
  if (down && left)  return DS4_HAT_SW;
  if (up)            return DS4_HAT_N;
  if (down)          return DS4_HAT_S;
  if (left)          return DS4_HAT_W;
  if (right)         return DS4_HAT_E;
  return DS4_HAT_NONE;
}

static void build_report(ds4_input_report_t *report, uint16_t buttons,
                         uint8_t counter, uint16_t timestamp)
{
  memset(report, 0, sizeof(*report));

  // No analog sticks on this board: report both centred and both triggers released.
  report->lx = report->ly = DS4_STICK_CENTER;
  report->rx = report->ry = DS4_STICK_CENTER;

  report->buttons0 = compute_hat(
      buttons & GLITCH_BTN_UP,
      buttons & GLITCH_BTN_DOWN,
      buttons & GLITCH_BTN_LEFT,
      buttons & GLITCH_BTN_RIGHT);

  // Game Boy face buttons map onto the DualShock diamond in the same positions.
  if (buttons & GLITCH_BTN_A)      report->buttons0 |= DS4_BTN_CROSS;
  if (buttons & GLITCH_BTN_B)      report->buttons0 |= DS4_BTN_CIRCLE;
  if (buttons & GLITCH_BTN_X)      report->buttons0 |= DS4_BTN_SQUARE;
  if (buttons & GLITCH_BTN_Y)      report->buttons0 |= DS4_BTN_TRIANGLE;

  if (buttons & GLITCH_BTN_SL)     report->buttons1 |= DS4_BTN_L1;
  if (buttons & GLITCH_BTN_SR)     report->buttons1 |= DS4_BTN_R1;
  if (buttons & GLITCH_BTN_START)  report->buttons1 |= DS4_BTN_OPTIONS;
  if (buttons & GLITCH_BTN_SELECT) report->buttons1 |= DS4_BTN_SHARE;

  // The low two bits of buttons2 are PS and touchpad-click; the counter lives
  // in the upper six and must advance on every report.
  report->buttons2 = (uint8_t) (counter << 2);

  report->timestamp   = timestamp;
  report->status      = DS4_STATUS_FULL;
  report->touch_count = 0;
}

// Stream a report to the host. Unlike a generic HID gamepad we send on every
// interval rather than only on change: the real controller streams
// continuously, and the report counter has to keep moving for drivers that
// use it to detect a stalled device.
//
// The interval is 1 ms, the fastest a full-speed interrupt endpoint goes,
// because the glitch offset is set in 1 ms steps and a 5 ms report clock
// would round it to the nearest 5.
static void hid_task(void)
{
  static uint32_t last_poll_ms = 0;
  static uint8_t counter = 0;
  static uint16_t timestamp = 0;

  if ( now_ms() - last_poll_ms < DS4_REPORT_INTERVAL_MS ) return;

  // Wake the host if we are suspended and the user presses something. The
  // latch is left alone so the press is still in the first report after.
  if ( tud_suspended() )
  {
    if ( latched_buttons ) tud_remote_wakeup();
    return;
  }

  // Not ready means the previous report is still in flight; keep latching
  // into the next one rather than dropping what was pressed meanwhile.
  if ( !tud_hid_ready() ) return;
  last_poll_ms = now_ms();

  // take the latch; whatever is down right now seeds the next one
  uint16_t buttons = latched_buttons;
  latched_buttons = glitch_update(&glitch, time_us_32(), read_buttons());

  ds4_input_report_t report;
  build_report(&report, buttons, counter, timestamp);

  if ( tud_hid_report(DS4_REPORT_ID_INPUT, &report, sizeof(report)) )
  {
    counter = (uint8_t) ((counter + 1) & 0x3F);
    // the stamp counts 5.33 us (16/3 us) ticks: 187.5 per millisecond
    timestamp = (uint16_t) (timestamp + (DS4_REPORT_INTERVAL_MS * 1000u * 3u) / 16u);
  }
}

//--------------------------------------------------------------------+
// LED feedback
//--------------------------------------------------------------------+

static void led_task(void)
{
  // The quick-glitch layer owns the LED while it is doing something: a fast
  // blink while recording, solid while a replay is running.
  if ( glitch.mode == GLITCH_FIRING )
  {
    gpio_put(PIN_LED, 1);
    return;
  }
  const uint32_t interval_ms = glitch.mode == GLITCH_RECORDING ? BLINK_RECORDING
                                                                : blink_interval_ms;

  // When mounted (blink_interval_ms == 0) light the LED while any input is
  // active, giving immediate tactile feedback. Otherwise blink to signal the
  // current USB state.
  if ( interval_ms == 0 )
  {
    bool any = false;

    for ( size_t i = 0; i < sizeof(k_button_pins) / sizeof(k_button_pins[0]); i++ )
    {
      if ( button_pressed(k_button_pins[i]) ) { /* any = true; */  break; }
    }

    gpio_put(PIN_LED, any);
    return;
  }

  static uint32_t last_toggle_ms = 0;
  static bool led_on = false;

  if ( now_ms() - last_toggle_ms < interval_ms ) return;
  last_toggle_ms = now_ms();

  led_on = !led_on;
  gpio_put(PIN_LED, led_on);
}

//--------------------------------------------------------------------+
// Main
//--------------------------------------------------------------------+

int main(void)
{
  board_setup();
  glitch_init(&glitch);

  tud_init(BOARD_TUD_RHPORT);

  while (1)
  {
    tud_task();      // service the USB device stack
    glitch_task();   // read buttons through the record / replay layer
    hid_task();      // send what the layer produced
    led_task();      // status / activity LED
  }
}
