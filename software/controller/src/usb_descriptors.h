#ifndef USB_DESCRIPTORS_H_
#define USB_DESCRIPTORS_H_

// String descriptor indices. The real DualShock 4 exposes no serial string,
// so we don't either - a serial the host has never seen from a controller
// with this VID/PID is a needless difference.
enum {
  STRID_LANGID = 0,
  STRID_MANUFACTURER,
  STRID_PRODUCT,
};

// The vault's feature report (0xF1), implemented in main.c: the descriptor
// file routes GET / SET of that report ID here. See vault.h for the layout.
uint16_t app_vault_get_report(uint8_t *buffer, uint16_t reqlen);
void     app_vault_set_report(uint8_t const *buffer, uint16_t bufsize);

#endif /* USB_DESCRIPTORS_H_ */
