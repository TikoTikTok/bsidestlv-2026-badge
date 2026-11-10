// BSidesTLV 2026 badge — mini clips
//
// Two small clips, one on each side of the USB-C plug. Each pinches the
// board's edge in a U channel and puts a flat foot with two lips on the
// phone's bottom edge, in the gap the seated plug leaves. The foot stops the
// board tilting toward the screen or the back, which is what rocks the plug
// in the port. Both clips are the same part.
//
// On the badge as built the board is centred on the plug's axis (measured on
// a printed clip: the board runs through the middle of the foot), so the
// channel is at Z = board_z = 0. part = "gauge" prints a comb of slots at
// known offsets (-3.8, 0, 3.8; "gauge_b" -1.9, 1.9) to check that on a new
// board revision in two prints.
//
// Frame: X across the phone, Y up (toward the phone), Z through the phone,
// +Z = the phone's back. Z = 0 is the plug's axis. X = 0 is the clip's own centre; the two clips sit
// at X = +/- clip_x on the badge.
//
// Numbers come from PhoneController.kicad_pcb (board 1.6 mm, the stem's top
// edge within 2 mm of the tip for 15 mm either side of the plug, no parts
// within 29 mm of the tip) and the Hanbo TC-002 drawing (plug housing 10.10
// wide, 11.25 mm past the board edge, 0.27 mm stand-off).
//
// Print: on its side (the 8 mm width up), no supports, every wall vertical.
// PETG preferred, PLA fine. 0.2 mm layers. ~0.6 g, a few minutes; dozens
// per plate.
//
//   openscad -o badge-clip-10.5.stl -D 'part="print"' -D phone_t=10.5 badge-clip.scad

part = "clip";       // "clip" | "assembly" | "section" | "print" | "gauge" | "gauge_b"
board_z   = 0;       // the board's mid-plane from the plug's axis (+ = toward the phone's back)
gauge_z   = [-3.8, 0, 3.8];   // the gauge's slots (gauge_b = [-1.9, 1.9]); at least slot_w + wall_t apart

// ---- the phone ---------------------------------------------------------
phone_t   = 10.5;    // [7:0.5:14] thickness of the phone (with its case) between the lips
lip_t     = 1.6;     // thickness of the lips
lip_front = 4;       // how far the lip reaches up the screen side (the chin)
lip_back  = 10;      // ... and up the back: the lever that stops the tilt

// ---- the badge ---------------------------------------------------------
pcb_t     = 1.6;
pcb_clear = 0.4;     // slot width over the board at the mouth
pinch     = 0.6;     // the slot narrows by this toward its roof: the walls spring and clamp
clip_w    = 12;      // width of each clip along the board edge
clip_x    = 12;      // centre of each clip from the plug (housing is 10.1 wide)
chan_d    = 16;      // depth of the U channel onto the board: the lever on the board side
wall_t    = 1.6;     // the channel's walls
bridge    = 2.0;     // channel roof to the foot's top. The clip slides on the board, so any
                     // gap from the board's edge to the phone's edge >= this works
tip_gap   = 4.3;     // board edge to phone edge when the plug is seated, bare phone

chamfer = 0.6;
$fn = 24;

// derived: Y = 0 at the slot mouth, the board's edge rises into the channel
slot_w = pcb_t + pcb_clear;                   // slot width at the mouth
foot_y = chan_d + bridge;                     // the foot's top, where the phone sits
foot_t = bridge;                              // the foot is the bridge plate itself
z_f0 = -phone_t / 2 - lip_t;
z_f1 =  phone_t / 2 + lip_t;
eps = 0.01;

module profile(slots = [board_z]) {   // in YZ: [y, z]; slots = the channels' centres in Z
  if (len(slots) > 1) for (i = [1 : 1 : len(slots) - 1])
    assert(slots[i] - slots[i - 1] >= slot_w + wall_t, "slots too close: they would merge");
  z_out0 = min(slots) - slot_w / 2 - wall_t;
  z_out1 = max(slots) + slot_w / 2 + wall_t;
  difference() {
    polygon([[0, z_out0], [foot_y - foot_t, z_out0], [foot_y - foot_t, z_f0],
             [foot_y + lip_front, z_f0], [foot_y + lip_front, z_f0 + lip_t], [foot_y, z_f0 + lip_t],
             [foot_y, z_f1 - lip_t], [foot_y + lip_back, z_f1 - lip_t], [foot_y + lip_back, z_f1],
             [foot_y - foot_t, z_f1], [foot_y - foot_t, z_out1], [0, z_out1]]);
    // the slots, narrowing toward the roof, with a lead-in at the mouth
    for (c = slots) let (z0 = c - slot_w / 2, z1 = c + slot_w / 2)
      polygon([[-eps, z0 - chamfer], [chamfer, z0], [chan_d, z0 + pinch / 2],
               [chan_d, z1 - pinch / 2], [chamfer, z1], [-eps, z1 + chamfer]]);
    // lead-ins on the lips
    polygon([[foot_y + lip_front + eps, z_f0 + lip_t + chamfer], [foot_y + lip_front - chamfer, z_f0 + lip_t],
             [foot_y + lip_front + eps, z_f0 + lip_t - eps]]);
    polygon([[foot_y + lip_back + eps, z_f1 - lip_t - chamfer], [foot_y + lip_back - chamfer, z_f1 - lip_t],
             [foot_y + lip_back + eps, z_f1 - lip_t + eps]]);
  }
}

module clip(slots = [board_z]) {
  rotate([90, 0, 90]) translate([0, 0, -clip_w / 2]) linear_extrude(clip_w) profile(slots);
}

// ---- the other parts, for the pictures ---------------------------------
include <board-outline.scad>
pcb_front = board_z - pcb_t / 2;
pcb_back  = board_z + pcb_t / 2;

module board() {
  color("#1d3b2a") translate([0, 0, pcb_front]) linear_extrude(pcb_t) polygon(BOARD_OUTLINE);
  color("silver") {
    translate([-10.1 / 2, -2.3, -1.6]) cube([10.1, 2.3 + 1.2, 3.2]);
    translate([-8.25 / 2, 1.2, -1.2]) cube([8.25, 10.07, 2.4]);
  }
}

module phone() {
  color("#2b2b33", 0.9) difference() {
    translate([-36, 0, -phone_t / 2]) cube([72, 150, phone_t]);
    translate([-4.5, -eps, -1.4]) cube([9, 7, 2.8]);
    translate([-33, 4, -phone_t / 2 - eps]) cube([66, 140, 0.4]);
  }
}

module half() { intersection() { children(); translate([-100, -60, -50]) cube([100, 200, 100]); } }

// on the badge the board's tip is at Y = 0 and the phone's edge at Y = tip_gap;
// each clip hangs from the phone's edge, its slot roof a little above the board's edge
clip_y = tip_gap - foot_y;

if (part == "clip") clip();
if (part == "print") rotate([0, -90, 0]) translate([-clip_w / 2, 0, 0]) clip();
if (part == "gauge") rotate([0, -90, 0]) translate([-clip_w / 2, 0, 0]) clip(gauge_z);
if (part == "gauge_b") rotate([0, -90, 0]) translate([-clip_w / 2, 0, 0]) clip([-1.9, 1.9]);
if (part == "assembly") {
  for (s = [-1, 1]) color("#c8e64a") translate([s * clip_x, clip_y, 0]) clip();
  board();
  translate([0, tip_gap, 0]) phone();
}
if (part == "section") {
  color("#c8e64a") half() translate([clip_x, clip_y, 0]) clip();
  half() translate([clip_x, 0, 0]) board();
  half() translate([clip_x, tip_gap, 0]) phone();
}
