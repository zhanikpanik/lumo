import { fonts } from './fonts';

export const theme = {
  fonts,
  colors: {
    // ── Base surfaces ──
    background: '#1A1A1A',
    surface: '#2C2C2C',
    surfaceDeep: '#111111',
    surfaceLight: '#333333',
    divider: '#333333',
    editActiveBg: '#2A2A2A',
    numpadBg: '#1A1A1A',

    // ── Brand actions ──
    accent: '#00C853',
    accentLight: '#00E676',

    // ── Destructive ──
    destructive: '#D32F2F',
    destructiveLight: '#FF5252',

    // ── Warning / Attention ──
    warning: '#FFB74D',
    warningBg: '#4A3A00',
    warningSubtle: '#FF8A80',
    warningSubtleAlt: '#FF8A65',
    warningOrange: '#FF7A45',

    // ── Info ──
    info: '#1976D2',
    infoOrange: '#F57C00',

    // ── Online ──
    online: '#4CAF50',

    // ── Text ──
    textPrimary: '#FFFFFF',
    textSecondary: '#999999',
    textTertiary: '#ADADAD',
    textDark: '#000000',
    textDisabled: '#555555',
    white: '#FFFFFF',

    // ── Navigation / Selection ──
    tabActive: '#5B4FE8',
    actionMenuPurple: '#8B7FF9',

    // ── Order status ──
    orderDefault: '#333333',
    orderActive: '#003E21',
    orderAlert: '#400A0A',
    orderCancelled: '#4A0A0A',
    orderInactive: '#666666',
    orderItemActive: '#FFFFFF',
    orderItemActiveText: '#000000',

    // ── Ordered products in grid ──
    orderedBg: '#003E21',
    orderedName: '#A5D6A7',
    orderedQtyBadge: '#00E676',

    // ── Legacy (keep for backward compat) ──
    actionBackground: '#E8F5E9',
    actionText: '#2E7D32',
    btnRed: '#D32F2F',
    btnGreen: '#00E676',

    // ── Badges & Chips ──
    badgePaid: '#0A3D1F',
    badgePaidText: '#00C853',
    badgeCancelled: '#3D0A0A',
    badgeCancelledText: '#FF8A80',
    badgeRefunded: '#3D2A0A',
    badgeRefundedText: '#FFB74D',
    chipError: '#5A1010',
    chipAck: '#3D3D0A',
    chipRetryBg: '#455A64',

    // ── Overlays & Translucent ──
    overlay: 'rgba(0,0,0,0.6)',
    overlayLight: 'rgba(0,0,0,0.25)',
    subtleBorder: 'rgba(255,255,255,0.08)',
    pageDivider: 'rgba(255,255,255,0.1)',
    hairlineBorder: 'rgba(255,255,255,0.06)',
    accentTint: 'rgba(0,200,83,0.18)',
    accentTintSubtle: 'rgba(0,200,83,0.15)',
    dangerTint: 'rgba(211,47,47,0.12)',

    // ── Banners (App-level) ──
    bannerSyncing: '#254A62',
    bannerOutbox: '#7A5A00',
    bannerOutboxStale: '#7A1010',
    bannerDeadLetter: '#B71C1C',

    // ── Translucent white ──
    whiteAlpha85: 'rgba(255,255,255,0.85)',
    whiteAlpha70: 'rgba(255,255,255,0.7)',
    whiteAlpha65: 'rgba(255,255,255,0.65)',
    whiteAlpha60: 'rgba(255,255,255,0.6)',
    whiteAlpha50: 'rgba(255,255,255,0.5)',

    // ── iOS-specific (FunctionsModal) ──
    iOSSurface: '#2C2C2E',
    iOSBorder: '#1C1C1E',
    iOSBorderTop: '#2C2C2E',
    iOSTextSecondary: '#8E8E93',
    iOSDestructive: '#FF453A',
  },
  categories: {
    coffee: '#5B4FE8',
    food: '#1976D2',
    drinks: '#2E7D32',
    desserts: '#6D4C41',
  },
  borderRadius: 10,
};
