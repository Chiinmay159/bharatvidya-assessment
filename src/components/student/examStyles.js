/* Shared style objects for exam screens (separate file so component
 * files only export components — keeps React Fast Refresh working). */

export const centerFlex = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }

export const iconWrap = {
  width: 56, height: 56, borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  margin: '0 auto 18px',
}
