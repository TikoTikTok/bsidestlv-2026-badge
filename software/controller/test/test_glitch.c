/*
 * Host-side tests for the quick-glitch engine. No SDK, no USB: a fake clock
 * feeds glitch_update() a scripted sequence of physical button states and the
 * test records every change in what the host would have seen.
 *
 *   make -C software/controller/test
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "../src/glitch.h"

#define STEP_US 50u          // simulated call rate: 20 kHz, slower than the badge

static glitch_t g;
static uint32_t now;
static uint16_t physical;
static uint16_t last_out;

typedef struct { uint32_t at; uint16_t out; } edge_t;
static edge_t edges[4096];
static int nedges;

static int failures;

#define CHECK(cond, ...) do { if (!(cond)) { failures++; \
  printf("  FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static void reset(void)
{
  glitch_init(&g);
  now = 1000000u;     // not zero, so "reached(now, 0)" bugs would show
  physical = 0;
  last_out = 0xFFFF;
  nedges = 0;
}

// Run the clock forward, logging every change of the reported buttons.
static void run(uint32_t us)
{
  for (uint32_t t = 0; t < us; t += STEP_US)
  {
    uint16_t out = glitch_update(&g, now, physical);
    if (out != last_out)
    {
      if (nedges < (int) (sizeof(edges) / sizeof(edges[0]))) edges[nedges++] = (edge_t) { now, out };
      last_out = out;
    }
    now += STEP_US;
  }
}

static void press(uint16_t b)   { physical |= b;  run(STEP_US); }
static void release(uint16_t b) { physical &= (uint16_t) ~b; run(STEP_US); }
static void tap(uint16_t b, uint32_t hold_us) { press(b); run(hold_us); release(b); }

// SELECT + button, with realistic human timing around the chord.
static void chord(uint16_t b)
{
  press(GLITCH_BTN_SELECT); run(20000);
  tap(b, 60000);
  run(20000); release(GLITCH_BTN_SELECT);
}

// Timestamp of the first edge at or after `from` where `mask` bits become set.
static int find_rise(int from_edge, uint16_t mask, uint32_t *at)
{
  for (int i = from_edge; i < nedges; i++)
  {
    uint16_t prev = i ? edges[i - 1].out : 0;
    if ((edges[i].out & mask) && !(prev & mask)) { *at = edges[i].at; return i; }
  }
  return -1;
}
static int find_fall(int from_edge, uint16_t mask, uint32_t *at)
{
  for (int i = from_edge; i < nedges; i++)
  {
    uint16_t prev = i ? edges[i - 1].out : 0;
    if (!(edges[i].out & mask) && (prev & mask)) { *at = edges[i].at; return i; }
  }
  return -1;
}

static bool near(uint32_t a, uint32_t b, uint32_t tol) { return (a > b ? a - b : b - a) <= tol; }

//--------------------------------------------------------------------+

static void test_passthrough(void)
{
  printf("passthrough: buttons reach the host unchanged when SELECT is up\n");
  reset();
  run(1000);
  tap(GLITCH_BTN_A, 50000);
  tap(GLITCH_BTN_UP | GLITCH_BTN_X, 30000);
  uint32_t t;
  CHECK(find_rise(0, GLITCH_BTN_A, &t) >= 0, "A press seen");
  CHECK(find_rise(0, GLITCH_BTN_UP, &t) >= 0, "UP press seen");
  CHECK(find_rise(0, GLITCH_BTN_X, &t) >= 0, "X press seen");
  CHECK(g.mode == GLITCH_IDLE, "still idle");
}

static void test_select_tap(void)
{
  printf("select: a bare press is forwarded as a tap on release, a chord is not\n");
  reset();
  run(1000);
  press(GLITCH_BTN_SELECT); run(200000);
  uint32_t t;
  CHECK(find_rise(0, GLITCH_BTN_SELECT, &t) < 0, "SELECT hidden while held");
  release(GLITCH_BTN_SELECT);
  run(100000);
  uint32_t up, down;
  int i = find_rise(0, GLITCH_BTN_SELECT, &up);
  CHECK(i >= 0, "tap emitted on release");
  CHECK(find_fall(i, GLITCH_BTN_SELECT, &down) >= 0 && near(down - up, GLITCH_SELECT_TAP_US, STEP_US * 2),
        "tap lasts %u us", GLITCH_SELECT_TAP_US);

  // now a chord: the offset key. no tap, nothing physical leaks
  int before = nedges;
  press(GLITCH_BTN_SELECT); run(20000);
  tap(GLITCH_BTN_RIGHT, 50000);
  run(20000); release(GLITCH_BTN_SELECT); run(100000);
  CHECK(find_rise(before, GLITCH_BTN_SELECT, &t) < 0, "no tap after a chord");
  CHECK(find_rise(before, GLITCH_BTN_RIGHT, &t) < 0, "RIGHT under SELECT stays on the badge");
  CHECK(g.offset_us == 1000, "offset is 1 ms, got %u", g.offset_us);
}

static void test_speed_and_offset_keys(void)
{
  printf("keys: UP/DOWN walk the speed table, LEFT/RIGHT step and auto-repeat the offset\n");
  reset();
  uint8_t num, den;
  glitch_speed(&g, &num, &den);
  CHECK(num == 1 && den == 1, "default speed is 1x");
  chord(GLITCH_BTN_UP); chord(GLITCH_BTN_UP); chord(GLITCH_BTN_UP);
  glitch_speed(&g, &num, &den);
  CHECK(num == 8 && den == 1, "three UPs is 8x, got %u/%u", num, den);
  for (int i = 0; i < 10; i++) chord(GLITCH_BTN_UP);
  glitch_speed(&g, &num, &den);
  CHECK(num == 32 && den == 1, "caps at 32x, got %u/%u", num, den);
  for (int i = 0; i < 20; i++) chord(GLITCH_BTN_DOWN);
  glitch_speed(&g, &num, &den);
  CHECK(num == 1 && den == 4, "floors at 1/4x, got %u/%u", num, den);

  // offset: taps
  chord(GLITCH_BTN_RIGHT); chord(GLITCH_BTN_RIGHT); chord(GLITCH_BTN_LEFT);
  CHECK(g.offset_us == 1000, "2 right 1 left = 1 ms, got %u", g.offset_us);
  chord(GLITCH_BTN_LEFT); chord(GLITCH_BTN_LEFT);
  CHECK(g.offset_us == 0, "floors at 0, got %u", g.offset_us);

  // offset: hold RIGHT. The press is 1 ms, repeats land at delay + k*rate,
  // and from the 21st repeat on the step is 10 ms.
  press(GLITCH_BTN_SELECT); run(20000);
  press(GLITCH_BTN_RIGHT);
  run(GLITCH_REPEAT_DELAY_US + GLITCH_REPEAT_RATE_US * 10 + 1000);   // repeats 0..10
  CHECK(g.offset_us == 12000, "press + 11 repeats: 12 ms, got %u", g.offset_us);
  run(GLITCH_REPEAT_RATE_US * 10);                                    // repeats 11..20
  CHECK(g.offset_us == 31000, "20 fine, 1 coarse: 31 ms, got %u", g.offset_us);
  run(GLITCH_REPEAT_RATE_US * 5);                                     // repeats 21..25
  CHECK(g.offset_us == 81000, "then 10 ms steps: 81 ms, got %u", g.offset_us);
  release(GLITCH_BTN_RIGHT); run(20000); release(GLITCH_BTN_SELECT);
  run(GLITCH_REPEAT_RATE_US * 5);
  CHECK(g.offset_us == 81000, "stops repeating on release, got %u", g.offset_us);
}

static void test_record_and_fire(void)
{
  printf("record/fire: a take is replayed after START + offset, scaled by speed\n");
  reset();
  run(1000);

  // record: X held 80 ms, 120 ms gap, A held 40 ms
  chord(GLITCH_BTN_SL);
  CHECK(g.mode == GLITCH_RECORDING, "recording");
  run(500000);                       // leading silence must not count
  tap(GLITCH_BTN_X, 80000);
  run(120000);
  tap(GLITCH_BTN_A, 40000);
  run(300000);                       // trailing silence must not count
  chord(GLITCH_BTN_SL);
  CHECK(g.mode == GLITCH_IDLE, "stopped");
  CHECK(g.count == 4, "4 events (X down, X up, A down, A up), got %u", g.count);
  CHECK(g.events[0].at_us == 0 && g.events[0].buttons == GLITCH_BTN_X, "first event is X at 0");
  CHECK(near(g.events[3].at_us, 80000 + 120000 + 40000 + 3 * STEP_US, 1000),
        "take is ~240 ms long, got %u us", g.events[3].at_us);
  // the recording pass-through still reached the host
  uint32_t t;
  CHECK(find_rise(0, GLITCH_BTN_X, &t) >= 0, "X reached the host while recording");

  // set offset 250 ms (via the field: the key path is tested above), speed 4x
  g.offset_us = 250000;
  chord(GLITCH_BTN_UP); chord(GLITCH_BTN_UP);

  int before = nedges;
  press(GLITCH_BTN_SELECT); run(20000);
  press(GLITCH_BTN_SR);
  uint32_t fired = now;
  run(60000); release(GLITCH_BTN_SR); run(20000); release(GLITCH_BTN_SELECT);
  run(600000);
  CHECK(g.mode == GLITCH_IDLE, "back to idle after the replay");

  uint32_t st_up, st_down, x_up, x_down, a_up, a_down;
  int i = find_rise(before, GLITCH_BTN_START, &st_up);
  CHECK(i >= 0 && near(st_up, fired, STEP_US * 2), "START rises when the chord is pressed");
  CHECK(find_fall(i, GLITCH_BTN_START, &st_down) >= 0 && near(st_down - st_up, GLITCH_TRIGGER_US, STEP_US * 2),
        "START held %u us", GLITCH_TRIGGER_US);
  int xi = find_rise(before, GLITCH_BTN_X, &x_up);
  CHECK(xi >= 0 && near(x_up - st_up, 250000, STEP_US * 2), "X lands offset after START: %d us", (int) (x_up - st_up));
  CHECK(find_fall(xi, GLITCH_BTN_X, &x_down) >= 0 && near(x_down - x_up, 20000, STEP_US * 3),
        "80 ms at 4x is 20 ms, got %u", x_down - x_up);
  int ai = find_rise(xi, GLITCH_BTN_A, &a_up);
  CHECK(ai >= 0 && near(a_up - x_down, 30000, STEP_US * 3), "120 ms gap at 4x is 30 ms, got %u", a_up - x_down);
  CHECK(find_fall(ai, GLITCH_BTN_A, &a_down) >= 0 && near(a_down - a_up, 10000, STEP_US * 3),
        "40 ms at 4x is 10 ms, got %u", a_down - a_up);
  CHECK(find_rise(before, GLITCH_BTN_SR, &t) < 0, "SR itself never reaches the host");
  CHECK(find_rise(before, GLITCH_BTN_SELECT, &t) < 0, "no SELECT tap after firing");
}

static void test_hold_to_repeat(void)
{
  printf("repeat: holding the fire chord refires every ~%u ms\n", GLITCH_REPEAT_GAP_US / 1000);
  reset();
  chord(GLITCH_BTN_SL); tap(GLITCH_BTN_X, 10000); chord(GLITCH_BTN_SL);
  g.offset_us = 100000;

  int before = nedges;
  press(GLITCH_BTN_SELECT); run(20000);
  press(GLITCH_BTN_SR);
  run(2000000);                      // 2 s held
  release(GLITCH_BTN_SR); run(20000); release(GLITCH_BTN_SELECT);
  run(1000000);

  int fires = 0;
  uint32_t t, prev = 0;
  for (int i = before; (i = find_rise(i, GLITCH_BTN_START, &t)) >= 0; i++)
  {
    if (fires) CHECK(near(t - prev, 100000 + 10000 + GLITCH_REPEAT_GAP_US, 2000),
                     "refire period ~%u us, got %u", 110000 + GLITCH_REPEAT_GAP_US, t - prev);
    prev = t; fires++;
  }
  // 2 s / (30 ms trigger... replay ends at 110 ms, +600 ms gap) = one fire per 710 ms
  CHECK(fires == 3, "3 fires in 2 s, got %d", fires);
}

static void test_reset_and_limits(void)
{
  printf("reset/limits: SELECT+B forgets everything, a full take closes cleanly\n");
  reset();
  chord(GLITCH_BTN_SL);
  for (int i = 0; i < 200; i++) tap(GLITCH_BTN_A, 2000);     // 400 changes: overflows
  CHECK(g.mode == GLITCH_IDLE, "recording stopped itself when full");
  CHECK(g.count <= GLITCH_MAX_EVENTS, "count %u within %u", g.count, GLITCH_MAX_EVENTS);
  CHECK(g.events[g.count - 1].buttons == 0, "take ends released");

  chord(GLITCH_BTN_UP); chord(GLITCH_BTN_RIGHT);
  chord(GLITCH_BTN_B);
  uint8_t num, den; glitch_speed(&g, &num, &den);
  CHECK(g.count == 0 && g.offset_us == 0 && num == 1 && den == 1, "cleared");

  // firing with no take is just the trigger tap
  int before = nedges;
  chord(GLITCH_BTN_SR);
  run(200000);
  uint32_t t;
  CHECK(find_rise(before, GLITCH_BTN_START, &t) >= 0, "trigger still fires");
  CHECK(g.mode == GLITCH_IDLE, "and returns to idle");
}

static void test_wraparound(void)
{
  printf("clock: everything survives the 32-bit microsecond wrap\n");
  reset();
  chord(GLITCH_BTN_SL); tap(GLITCH_BTN_X, 20000); chord(GLITCH_BTN_SL);
  g.offset_us = 300000;
  now = 0xFFFFFFFFu - 150000u;       // the wrap lands inside the offset wait
  int before = nedges;
  chord(GLITCH_BTN_SR);
  run(800000);
  uint32_t st, x;
  CHECK(find_rise(before, GLITCH_BTN_START, &st) >= 0, "fired");
  CHECK(find_rise(before, GLITCH_BTN_X, &x) >= 0 && near(x - st, 300000, STEP_US * 2),
        "X lands 300 ms after START across the wrap, got %u", x - st);
  CHECK(g.mode == GLITCH_IDLE, "idle again");
}

int main(void)
{
  test_passthrough();
  test_select_tap();
  test_speed_and_offset_keys();
  test_record_and_fire();
  test_hold_to_repeat();
  test_reset_and_limits();
  test_wraparound();
  if (failures) { printf("%d FAILED\n", failures); return 1; }
  printf("all glitch engine tests passed\n");
  return 0;
}
