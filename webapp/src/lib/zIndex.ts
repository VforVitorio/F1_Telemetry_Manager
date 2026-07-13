// Fixed z-index scale (baseline-ui: no arbitrary z-*). Higher sits closer to the
// user. Chrome (rail/header) below floating layers; tooltip always on top.
export const Z = {
  base: 0,
  rail: 30,
  header: 40,
  overlay: 60,
  modal: 70,
  // Popovers/comboboxes sit ABOVE modals+sheets: a combobox opened inside a
  // Sheet must stay clickable, and z-index beats DOM order in the same stack.
  dropdown: 75,
  toast: 80,
  tooltip: 90,
} as const
