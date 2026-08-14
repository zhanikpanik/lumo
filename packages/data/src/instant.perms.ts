// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/core";

const venueMembers = (venuePath: string) =>
  `auth.id != null && (auth.id in data.ref('${venuePath}.activeDeviceUsers.id') || auth.id in data.ref('${venuePath}.ownerUsers.id') || auth.id in data.ref('${venuePath}.managerUsers.id'))`;
const venueAdmins = (venuePath: string) =>
  `auth.id != null && (auth.id in data.ref('${venuePath}.ownerUsers.id') || auth.id in data.ref('${venuePath}.managerUsers.id'))`;
const venueAdminMutation = (venuePath: string) =>
  `${venueAdmins(venuePath)} && rateLimit.adminMutations.limit(auth.id)`;
const venueDevices = (venuePath: string) =>
  `auth.id != null && auth.id in data.ref('${venuePath}.activeDeviceUsers.id')`;

const rules = {
  products: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  orderItems: {
    allow: {
      view: venueMembers('order.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  attrs: {
    allow: {
      create: "false",
    },
  },
  zones: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  devices: {
    allow: {
      view: `auth.id != null && (auth.id in data.ref('authUser.id') || ${venueAdmins('venue')})`,
    },
  },
  activationChallenges: {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  activationChallengeClaims: {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  recipeItems: {
    allow: {
      view: venueMembers('dish.venue'),
      create: venueAdminMutation('dish.venue'),
      delete: venueAdminMutation('dish.venue'),
      update: venueAdminMutation('dish.venue'),
    },
  },
  employees: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  tables: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  $users: {
    allow: {
      view: "auth.id != null && auth.id == data.id",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  orderItemModifiers: {
    allow: {
      view: venueMembers('orderItem.order.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  categories: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  fiscalReceipts: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  deviceAuthorizations: {
    allow: {
      view: `auth.id != null && (auth.id in data.ref('device.authUser.id') || ${venueAdmins('venue')})`,
    },
  },
  cashMovements: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  kitchenTickets: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  inventoryMovements: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  cashTransactionCategories: {
    allow: {
      view: venueAdmins('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  venues: {
    allow: {
      view: `auth.id != null && (auth.id in data.ref('activeDeviceUsers.id') || auth.id in data.ref('ownerUsers.id') || auth.id in data.ref('managerUsers.id'))`,
      update: `auth.id != null && (auth.id in data.ref('ownerUsers.id') || auth.id in data.ref('managerUsers.id')) && rateLimit.adminMutations.limit(auth.id)`,
    },
  },
  modifiers: {
    allow: {
      view: venueMembers('group.venue'),
      create: venueAdminMutation('group.venue'),
      delete: venueAdminMutation('group.venue'),
      update: venueAdminMutation('group.venue'),
    },
  },
  shifts: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  payments: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  orderEvents: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  $default: {
    allow: {
      $default: "false",
    },
  },
  organizations: {
    allow: {
      view: "false",
    },
  },
  auditEvents: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  commandOperations: {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  commandClaims: {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  financialContributions: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  analyticsProjectionCheckpoints: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  modifierGroups: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  orders: {
    allow: {
      view: venueMembers('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  memberships: {
    allow: {
      view: "auth.id != null && auth.id in data.ref('user.id')",
    },
  },
  employeePinCredentials: {
    allow: {
      view: venueDevices('employee.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },

  warehouses: {
    allow: {
      view: venueMembers('venue'),
      create: venueAdminMutation('venue'),
      delete: venueAdminMutation('venue'),
      update: venueAdminMutation('venue'),
    },
  },
  stockItems: {
    allow: {
      view: venueMembers('warehouse.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  deliveryDocuments: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  deliveryLines: {
    allow: {
      view: venueAdmins('document.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  writeOffDocuments: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  writeOffLines: {
    allow: {
      view: venueAdmins('document.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  transferDocuments: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  transferLines: {
    allow: {
      view: venueAdmins('document.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  inventorySessions: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  inventoryLines: {
    allow: {
      view: venueAdmins('session.venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  venueDailyStats: {
    allow: {
      view: venueAdmins('venue'),
      create: "false",
      delete: "false",
      update: "false",
    },
  },
} satisfies InstantRules;

export default {
  ...rules,
  $rateLimits: {
    adminMutations: {
      limits: [
        { capacity: 300, refill: { amount: 300, period: '1 minute' } },
        { capacity: 5_000, refill: { amount: 5_000, period: '1 hour' } },
      ],
    },
  },
} as unknown as InstantRules;
