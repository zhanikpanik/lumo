import { i } from '@instantdb/core';

const _schema = i.schema({
  entities: {
    $users: i.entity({}),
    organizations: i.entity({
      slug: i.string().unique().indexed(),
      name: i.string(),
      createdAt: i.date().indexed(),
    }),
    venues: i.entity({
      slug: i.string().unique().indexed(),
      name: i.string(),
      currency: i.string(),
      timeZone: i.string(),
      venueType: i.string(),
      address: i.string().optional(),
      phone: i.string().optional(),
      dailyLaborCostTiyin: i.number().optional(),
      trackGuests: i.boolean(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),
    cashTransactionCategories: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      type: i.string().indexed(),
      sortOrder: i.number().indexed(),
      createdAt: i.date().indexed(),
    }),
    memberships: i.entity({
      role: i.string().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    devices: i.entity({
      installationId: i.string().unique().indexed(),
      label: i.string(),
      platform: i.string(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
      revokedAt: i.date().optional(),
    }),
    deviceAuthorizations: i.entity({
      status: i.string().indexed(),
      activatedAt: i.date().indexed(),
      revokedAt: i.date().optional(),
    }),
    activationChallenges: i.entity({
      challengeHash: i.string().unique().indexed(),
      adminUserId: i.string().indexed(),
      email: i.string().indexed(),
      installationId: i.string().indexed(),
      label: i.string(),
      platform: i.string(),
      venuesJson: i.string(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
      expiresAt: i.date().indexed(),
      consumedAt: i.date().optional().indexed(),
    }),
    activationChallengeClaims: i.entity({
      claimKey: i.string().unique().indexed(),
      challengeId: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    employees: i.entity({
      venueId: i.string().indexed(),
      displayName: i.string(),
      role: i.string().indexed(),
      status: i.string().indexed(),
      email: i.string().optional(),
      version: i.number().indexed().optional(),
      createdAt: i.date().indexed(),
    }),
    employeePinCredentials: i.entity({
      pinSalt: i.string(),
      pinVerifier: i.string(),
      pinLookupHash: i.string().unique().indexed(),
      credentialsVersion: i.number().indexed(),
      expiresAt: i.date().indexed(),
      updatedAt: i.date().indexed(),
    }),
    employeePinSecrets: i.entity({
      pin: i.string(),
      updatedAt: i.date().indexed(),
    }),
    categories: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      color: i.string(),
      sortOrder: i.number().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    products: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      kind: i.string().indexed(),
      priceTiyin: i.number(),
      costTiyin: i.number(),
      unit: i.string(),
      lowStockThresholdMilli: i.number().optional().indexed(),
      sortOrder: i.number().indexed(),
      status: i.string().indexed(),
      version: i.number().indexed().optional(),
      createdAt: i.date().indexed(),
    }),
    modifierGroups: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      maxSelect: i.number(),
      isRequired: i.boolean(),
      sortOrder: i.number().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    modifiers: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      priceTiyin: i.number(),
      sortOrder: i.number().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    recipeItems: i.entity({
      venueId: i.string().indexed(),
      quantityMilli: i.number(),
      unit: i.string(),
      createdAt: i.date().indexed(),
    }),
    zones: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      gridCols: i.number(),
      gridRows: i.number(),
      sortOrder: i.number().indexed(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
    }),
    tables: i.entity({
      venueId: i.string().indexed(),
      number: i.string(),
      capacity: i.number(),
      col: i.number(),
      row: i.number(),
      colSpan: i.number(),
      rowSpan: i.number(),
      size: i.string(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),
    shifts: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      openedAt: i.date().indexed(),
      closedAt: i.date().optional().indexed(),
      startingCashTiyin: i.number(),
      countedCashTiyin: i.number().optional(),
      openingNote: i.string().optional(),
      closingNote: i.string().optional(),
      status: i.string().indexed(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),
    orders: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      number: i.string(),
      status: i.string().indexed(),
      guestCount: i.number(),
      tableNumber: i.string().optional(),
      zoneName: i.string().optional(),
      orderType: i.string(),
      comment: i.string().optional(),
      isQuickCheck: i.boolean(),
      openedAt: i.date().indexed(),
      closedAt: i.date().optional().indexed(),
      totalAmountTiyin: i.number(),
      source: i.string().indexed(),
      externalOrderId: i.string().optional(),
      closeReason: i.string().optional(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),
    orderItems: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      productName: i.string(),
      productPriceTiyin: i.number(),
      quantity: i.number(),
      guestNumber: i.number(),
      comment: i.string().optional(),
      consumptionSnapshotJson: i.string(),
      createdAt: i.date().indexed(),
      sentAt: i.date().optional().indexed(),
    }),
    orderItemModifiers: i.entity({
      venueId: i.string().indexed(),
      modifierName: i.string(),
      modifierPriceTiyin: i.number(),
    }),
    kitchenTickets: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      sequence: i.number(),
      kind: i.string().indexed(),
      status: i.string().indexed(),
      snapshotJson: i.string(),
      attemptCount: i.number(),
      lastAttemptAt: i.date().optional().indexed(),
      createdAt: i.date().indexed(),
      resolvedAt: i.date().optional(),
    }),
    payments: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      method: i.string().indexed(),
      amountTiyin: i.number(),
      changeTiyin: i.number(),
      foodCostTiyin: i.number(),
      fiscalStatus: i.string().indexed(),
      fiscalNumber: i.string().optional(),
      fiscalResponse: i.json().optional(),
      closeReason: i.string().optional(),
      idempotencyKey: i.string().unique().indexed(),
      createdAt: i.date().indexed(),
    }),
    cashMovements: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      movementType: i.string().indexed(),
      amountTiyin: i.number(),
      note: i.string().optional(),
      version: i.number().indexed().optional(),
      occurredAt: i.date().indexed(),
      createdAt: i.date().indexed(),
    }),
    inventoryMovements: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      quantityDeltaMilli: i.number(),
      unit: i.string(),
      reason: i.string().indexed(),
      lineIdempotencyKey: i.string().unique().indexed(),
      metadata: i.json().optional(),
      occurredAt: i.date().indexed(),
      createdAt: i.date().indexed(),
    }),
    fiscalReceipts: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      status: i.string().indexed(),
      snapshotJson: i.string(),
      fiscalNumber: i.string().optional(),
      fiscalResponse: i.json().optional(),
      attemptCount: i.number(),
      lastAttemptAt: i.date().optional().indexed(),
      createdAt: i.date().indexed(),
      resolvedAt: i.date().optional(),
    }),
    auditEvents: i.entity({
      venueId: i.string().indexed(),
      action: i.string().indexed(),
      occurredAt: i.date().indexed(),
      metadata: i.json(),
    }),
    commandOperations: i.entity({
      operationKey: i.string().unique().indexed(),
      venueId: i.string().indexed(),
      kind: i.string().indexed(),
      requestHash: i.string(),
      status: i.string().indexed(),
      resultJson: i.string(),
      createdAt: i.date().indexed(),
      committedAt: i.date().indexed(),
    }),
    commandClaims: i.entity({
      claimKey: i.string().unique().indexed(),
      operationKey: i.string().indexed(),
      venueId: i.string().indexed(),
      resourceType: i.string().indexed(),
      resourceId: i.string().indexed(),
      expectedVersion: i.number(),
      createdAt: i.date().indexed(),
    }),
    financialContributions: i.entity({
      contributionKey: i.string().unique().indexed(),
      operationKey: i.string().unique().indexed(),
      venueId: i.string().indexed(),
      kind: i.string().indexed(),
      revenueDeltaTiyin: i.number(),
      foodCostDeltaTiyin: i.number(),
      cashDeltaTiyin: i.number(),
      occurredAt: i.date().indexed(),
    }),
    orderEvents: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      action: i.string().indexed(),
      occurredAt: i.date().indexed(),
      metadata: i.json().optional(),
    }),
    venueDailyStats: i.entity({
      venueId: i.string().indexed(),
      day: i.string().indexed(),
      revenueTiyin: i.number(),
      orderCount: i.number(),
      foodCostTiyin: i.number(),
      cashExpenseTiyin: i.number(),
      updatedAt: i.date().indexed(),
      statsKey: i.string().unique().indexed(),
      sourceCount: i.number(),
      sourceHash: i.string().indexed(),
      version: i.number().indexed(),
    }),
    analyticsProjectionCheckpoints: i.entity({
      contributionKey: i.string().unique().indexed(),
      venueId: i.string().indexed(),
      day: i.string().indexed(),
      sourceHash: i.string().indexed(),
      dayVersion: i.number(),
      appliedAt: i.date().indexed(),
    }),
    // ── Warehouse ──
    warehouses: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      createdAt: i.date().indexed(),
    }),

    stockItems: i.entity({
      venueId: i.string().indexed(),
      quantityMilli: i.number(),
      unit: i.string(),
      updatedAt: i.date().indexed(),
      version: i.number().indexed(),
    }),

    deliveryDocuments: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      supplier: i.string(),
      deliveryDate: i.date().indexed(),
      amountTiyin: i.number(),
      status: i.string().indexed(),
      source: i.string(),
      comment: i.string().optional(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),

    deliveryLines: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      quantityMilli: i.number(),
      orderedQuantityMilli: i.number().optional(),
      receivedQuantityMilli: i.number().optional(),
      unit: i.string(),
      priceTiyin: i.number(),
      orderedPriceTiyin: i.number().optional(),
      receivedPriceTiyin: i.number().optional(),
    }),

    writeOffDocuments: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      reasonSummary: i.string(),
      writeOffDate: i.date().indexed(),
      status: i.string().indexed(),
      createdByName: i.string(),
      comment: i.string().optional(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),

    writeOffLines: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      quantityMilli: i.number(),
      unit: i.string(),
      reason: i.string(),
    }),

    transferDocuments: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      transferDate: i.date().indexed(),
      status: i.string().indexed(),
      comment: i.string().optional(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),

    transferLines: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      quantityMilli: i.number(),
      unit: i.string(),
    }),

    inventorySessions: i.entity({
      venueId: i.string().indexed(),
      operationId: i.string().unique().indexed(),
      inventoryType: i.string(),
      conductedAt: i.date().indexed(),
      status: i.string().indexed(),
      resultDeltaTiyin: i.number(),
      createdAt: i.date().indexed(),
      version: i.number().indexed(),
    }),

    inventoryLines: i.entity({
      venueId: i.string().indexed(),
      name: i.string(),
      unit: i.string(),
      theoreticalMilli: i.number(),
      actualMilli: i.number(),
      unitPriceTiyin: i.number(),
      theoreticalStockVersion: i.number().indexed(),
    }),
  },
  links: {
    venueOrganization: {
      forward: { on: 'venues', has: 'one', label: 'organization', required: true },
      reverse: { on: 'organizations', has: 'many', label: 'venues' },
    },
    membershipOrganization: {
      forward: { on: 'memberships', has: 'one', label: 'organization', required: true },
      reverse: { on: 'organizations', has: 'many', label: 'memberships' },
    },
    membershipVenue: {
      forward: { on: 'memberships', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'memberships' },
    },
    membershipUser: {
      forward: { on: 'memberships', has: 'one', label: 'user', required: true },
      reverse: { on: '$users', has: 'many', label: 'memberships' },
    },
    deviceVenue: {
      forward: { on: 'devices', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'devices' },
    },
    deviceAuthUser: {
      forward: { on: 'devices', has: 'one', label: 'authUser', required: true },
      reverse: { on: '$users', has: 'many', label: 'devices' },
    },
    authorizationDevice: {
      forward: { on: 'deviceAuthorizations', has: 'one', label: 'device', required: true },
      reverse: { on: 'devices', has: 'many', label: 'authorizations' },
    },
    authorizationVenue: {
      forward: { on: 'deviceAuthorizations', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'deviceAuthorizations' },
    },
    authorizationActivator: {
      forward: { on: 'deviceAuthorizations', has: 'one', label: 'activatedBy', required: true },
      reverse: { on: '$users', has: 'many', label: 'activatedDevices' },
    },
    employeeVenue: {
      forward: { on: 'employees', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'employees' },
    },
    employeePinCredential: {
      forward: { on: 'employeePinCredentials', has: 'one', label: 'employee', required: true },
      reverse: { on: 'employees', has: 'one', label: 'pinCredential' },
    },
    employeePinSecret: {
      forward: { on: 'employeePinSecrets', has: 'one', label: 'employee', required: true },
      reverse: { on: 'employees', has: 'one', label: 'pinSecret' },
    },
    categoryVenue: {
      forward: { on: 'categories', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'categories' },
    },
    productVenue: {
      forward: { on: 'products', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'products' },
    },
    productCategory: {
      forward: { on: 'products', has: 'one', label: 'category' },
      reverse: { on: 'categories', has: 'many', label: 'products' },
    },
    modifierGroupVenue: {
      forward: { on: 'modifierGroups', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'modifierGroups' },
    },
    modifierGroupProducts: {
      forward: { on: 'modifierGroups', has: 'many', label: 'products' },
      reverse: { on: 'products', has: 'many', label: 'modifierGroups' },
    },
    modifierGroupModifiers: {
      forward: { on: 'modifiers', has: 'one', label: 'group', required: true },
      reverse: { on: 'modifierGroups', has: 'many', label: 'modifiers' },
    },
    recipeDish: {
      forward: { on: 'recipeItems', has: 'one', label: 'dish', required: true },
      reverse: { on: 'products', has: 'many', label: 'recipeItems' },
    },
    recipeIngredient: {
      forward: { on: 'recipeItems', has: 'one', label: 'ingredient', required: true },
      reverse: { on: 'products', has: 'many', label: 'ingredientRecipeItems' },
    },
    zoneVenue: {
      forward: { on: 'zones', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'zones' },
    },
    tableVenue: {
      forward: { on: 'tables', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'tables' },
    },
    tableZone: {
      forward: { on: 'tables', has: 'one', label: 'zone', required: true },
      reverse: { on: 'zones', has: 'many', label: 'tables' },
    },
    shiftVenue: {
      forward: { on: 'shifts', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'shifts' },
    },
    shiftOpenedBy: {
      forward: { on: 'shifts', has: 'one', label: 'openedBy', required: true },
      reverse: { on: 'employees', has: 'many', label: 'shiftsOpened' },
    },
    shiftDevice: {
      forward: { on: 'shifts', has: 'one', label: 'device' },
      reverse: { on: 'devices', has: 'many', label: 'shifts' },
    },
    orderVenue: {
      forward: { on: 'orders', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'orders' },
    },
    orderShift: {
      forward: { on: 'orders', has: 'one', label: 'shift' },
      reverse: { on: 'shifts', has: 'many', label: 'orders' },
    },
    orderTable: {
      forward: { on: 'orders', has: 'one', label: 'table' },
      reverse: { on: 'tables', has: 'many', label: 'orders' },
    },
    orderOwnerEmployee: {
      forward: { on: 'orders', has: 'one', label: 'ownerEmployee' },
      reverse: { on: 'employees', has: 'many', label: 'ownedOrders' },
    },
    orderDevice: {
      forward: { on: 'orders', has: 'one', label: 'device', required: true },
      reverse: { on: 'devices', has: 'many', label: 'orders' },
    },
    orderItemOrder: {
      forward: { on: 'orderItems', has: 'one', label: 'order', required: true },
      reverse: { on: 'orders', has: 'many', label: 'items' },
    },
    orderItemProduct: {
      forward: { on: 'orderItems', has: 'one', label: 'product' },
      reverse: { on: 'products', has: 'many', label: 'orderItems' },
    },
    orderItemModifierItem: {
      forward: { on: 'orderItemModifiers', has: 'one', label: 'orderItem', required: true },
      reverse: { on: 'orderItems', has: 'many', label: 'modifiers' },
    },
    orderItemModifierModifier: {
      forward: { on: 'orderItemModifiers', has: 'one', label: 'modifier' },
      reverse: { on: 'modifiers', has: 'many', label: 'orderItemModifiers' },
    },
    auditOrganization: {
      forward: { on: 'auditEvents', has: 'one', label: 'organization', required: true },
      reverse: { on: 'organizations', has: 'many', label: 'auditEvents' },
    },
    auditVenue: {
      forward: { on: 'auditEvents', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'auditEvents' },
    },
    auditDevice: {
      forward: { on: 'auditEvents', has: 'one', label: 'device' },
      reverse: { on: 'devices', has: 'many', label: 'auditEvents' },
    },
    auditEmployee: {
      forward: { on: 'auditEvents', has: 'one', label: 'employee' },
      reverse: { on: 'employees', has: 'many', label: 'auditEvents' },
    },
    auditAdminUser: {
      forward: { on: 'auditEvents', has: 'one', label: 'adminUser' },
      reverse: { on: '$users', has: 'many', label: 'auditEvents' },
    },
    auditOperation: {
      forward: { on: 'auditEvents', has: 'one', label: 'operation' },
      reverse: { on: 'commandOperations', has: 'many', label: 'auditEvents' },
    },
    ticketOrder: {
      forward: { on: 'kitchenTickets', has: 'one', label: 'order', required: true },
      reverse: { on: 'orders', has: 'many', label: 'kitchenTickets' },
    },
    ticketVenue: {
      forward: { on: 'kitchenTickets', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'kitchenTickets' },
    },
    ticketActorEmployee: {
      forward: { on: 'kitchenTickets', has: 'one', label: 'actorEmployee', required: true },
      reverse: { on: 'employees', has: 'many', label: 'kitchenTickets' },
    },
    ticketDevice: {
      forward: { on: 'kitchenTickets', has: 'one', label: 'device', required: true },
      reverse: { on: 'devices', has: 'many', label: 'kitchenTickets' },
    },
    paymentOrder: {
      forward: { on: 'payments', has: 'one', label: 'order', required: true },
      reverse: { on: 'orders', has: 'many', label: 'payments' },
    },
    paymentShift: {
      forward: { on: 'payments', has: 'one', label: 'shift' },
      reverse: { on: 'shifts', has: 'many', label: 'payments' },
    },
    paymentVenue: {
      forward: { on: 'payments', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'payments' },
    },
    paymentActorEmployee: {
      forward: { on: 'payments', has: 'one', label: 'actorEmployee', required: true },
      reverse: { on: 'employees', has: 'many', label: 'payments' },
    },
    paymentDevice: {
      forward: { on: 'payments', has: 'one', label: 'device', required: true },
      reverse: { on: 'devices', has: 'many', label: 'payments' },
    },
    cashMovementShift: {
      forward: { on: 'cashMovements', has: 'one', label: 'shift', required: true },
      reverse: { on: 'shifts', has: 'many', label: 'cashMovements' },
    },
    cashMovementVenue: {
      forward: { on: 'cashMovements', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'cashMovements' },
    },
    cashMovementPayment: {
      forward: { on: 'cashMovements', has: 'one', label: 'payment' },
      reverse: { on: 'payments', has: 'many', label: 'cashMovements' },
    },
    cashMovementOrder: {
      forward: { on: 'cashMovements', has: 'one', label: 'order' },
      reverse: { on: 'orders', has: 'many', label: 'cashMovements' },
    },
    inventoryMovementVenue: {
      forward: { on: 'inventoryMovements', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'inventoryMovements' },
    },
    inventoryMovementProduct: {
      forward: { on: 'inventoryMovements', has: 'one', label: 'product', required: true },
      reverse: { on: 'products', has: 'many', label: 'inventoryMovements' },
    },
    inventoryMovementWarehouse: {
      forward: { on: 'inventoryMovements', has: 'one', label: 'warehouse' },
      reverse: { on: 'warehouses', has: 'many', label: 'inventoryMovements' },
    },
    inventoryMovementOrder: {
      forward: { on: 'inventoryMovements', has: 'one', label: 'order' },
      reverse: { on: 'orders', has: 'many', label: 'inventoryMovements' },
    },
    inventoryMovementPayment: {
      forward: { on: 'inventoryMovements', has: 'one', label: 'payment' },
      reverse: { on: 'payments', has: 'many', label: 'inventoryMovements' },
    },
    fiscalReceiptPayment: {
      forward: { on: 'fiscalReceipts', has: 'one', label: 'payment', required: true },
      reverse: { on: 'payments', has: 'one', label: 'fiscalReceipt' },
    },
    fiscalReceiptVenue: {
      forward: { on: 'fiscalReceipts', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'fiscalReceipts' },
    },
    venueActiveDeviceUsers: {
      forward: { on: 'venues', has: 'many', label: 'activeDeviceUsers' },
      reverse: { on: '$users', has: 'many', label: 'activeDeviceVenues' },
    },
    venueOwnerUsers: {
      forward: { on: 'venues', has: 'many', label: 'ownerUsers' },
      reverse: { on: '$users', has: 'many', label: 'ownedVenues' },
    },
    orderEventOrder: {
      forward: { on: 'orderEvents', has: 'one', label: 'order', required: true },
      reverse: { on: 'orders', has: 'many', label: 'orderEvents' },
    },
    orderEventVenue: {
      forward: { on: 'orderEvents', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'orderEvents' },
    },
    venueManagerUsers: {
      forward: { on: 'venues', has: 'many', label: 'managerUsers' },
      reverse: { on: '$users', has: 'many', label: 'managedVenues' },
    },
    orderEventActorEmployee: {
      forward: { on: 'orderEvents', has: 'one', label: 'actorEmployee', required: true },
      reverse: { on: 'employees', has: 'many', label: 'orderEvents' },
    },
    orderEventDevice: {
      forward: { on: 'orderEvents', has: 'one', label: 'device', required: true },
      reverse: { on: 'devices', has: 'many', label: 'orderEvents' },
    },
    venueDailyStatsVenue: {
      forward: { on: 'venueDailyStats', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'dailyStats' },
    },
    analyticsProjectionCheckpointVenue: {
      forward: { on: 'analyticsProjectionCheckpoints', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'analyticsProjectionCheckpoints' },
    },
    analyticsProjectionCheckpointContribution: {
      forward: { on: 'analyticsProjectionCheckpoints', has: 'one', label: 'contribution', required: true },
      reverse: { on: 'financialContributions', has: 'one', label: 'projectionCheckpoint' },
    },
    analyticsProjectionCheckpointStats: {
      forward: { on: 'analyticsProjectionCheckpoints', has: 'one', label: 'dailyStats', required: true },
      reverse: { on: 'venueDailyStats', has: 'many', label: 'projectionCheckpoints' },
    },

    cashTransactionCategoryVenue: {
      forward: { on: 'cashTransactionCategories', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'cashTransactionCategories' },
    },

    // ── Warehouse links ──
    warehouseVenue: {
      forward: { on: 'warehouses', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'warehouses' },
    },
    warehouseProducts: {
      forward: { on: 'warehouses', has: 'many', label: 'products' },
      reverse: { on: 'products', has: 'many', label: 'warehouses' },
    },

    stockItemWarehouse: {
      forward: { on: 'stockItems', has: 'one', label: 'warehouse', required: true },
      reverse: { on: 'warehouses', has: 'many', label: 'stockItems' },
    },
    stockItemProduct: {
      forward: { on: 'stockItems', has: 'one', label: 'product', required: true },
      reverse: { on: 'products', has: 'many', label: 'stockItems' },
    },

    deliveryVenue: {
      forward: { on: 'deliveryDocuments', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'deliveries' },
    },
    deliveryWarehouse: {
      forward: { on: 'deliveryDocuments', has: 'one', label: 'warehouse', required: true },
      reverse: { on: 'warehouses', has: 'many', label: 'deliveries' },
    },
    deliveryLineDocument: {
      forward: { on: 'deliveryLines', has: 'one', label: 'document', required: true },
      reverse: { on: 'deliveryDocuments', has: 'many', label: 'lines' },
    },
    deliveryLineProduct: {
      forward: { on: 'deliveryLines', has: 'one', label: 'product', required: true },
      reverse: { on: 'products', has: 'many', label: 'deliveryLines' },
    },

    writeOffVenue: {
      forward: { on: 'writeOffDocuments', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'writeOffs' },
    },
    writeOffWarehouse: {
      forward: { on: 'writeOffDocuments', has: 'one', label: 'warehouse', required: true },
      reverse: { on: 'warehouses', has: 'many', label: 'writeOffs' },
    },
    writeOffLineDocument: {
      forward: { on: 'writeOffLines', has: 'one', label: 'document', required: true },
      reverse: { on: 'writeOffDocuments', has: 'many', label: 'lines' },
    },
    writeOffLineProduct: {
      forward: { on: 'writeOffLines', has: 'one', label: 'product', required: true },
      reverse: { on: 'products', has: 'many', label: 'writeOffLines' },
    },

    transferVenue: {
      forward: { on: 'transferDocuments', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'transfers' },
    },
    transferFromWarehouse: {
      forward: { on: 'transferDocuments', has: 'one', label: 'fromWarehouse', required: true },
      reverse: { on: 'warehouses', has: 'many', label: 'outgoingTransfers' },
    },
    transferToWarehouse: {
      forward: { on: 'transferDocuments', has: 'one', label: 'toWarehouse', required: true },
      reverse: { on: 'warehouses', has: 'many', label: 'incomingTransfers' },
    },
    transferLineDocument: {
      forward: { on: 'transferLines', has: 'one', label: 'document', required: true },
      reverse: { on: 'transferDocuments', has: 'many', label: 'lines' },
    },
    transferLineProduct: {
      forward: { on: 'transferLines', has: 'one', label: 'product', required: true },
      reverse: { on: 'products', has: 'many', label: 'transferLines' },
    },

    inventorySessionVenue: {
      forward: { on: 'inventorySessions', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'inventorySessions' },
    },
    inventorySessionWarehouse: {
      forward: { on: 'inventorySessions', has: 'one', label: 'warehouse', required: true },
      reverse: { on: 'warehouses', has: 'many', label: 'inventorySessions' },
    },
    inventoryLineSession: {
      forward: { on: 'inventoryLines', has: 'one', label: 'session', required: true },
      reverse: { on: 'inventorySessions', has: 'many', label: 'lines' },
    },
    inventoryLineProduct: {
      forward: { on: 'inventoryLines', has: 'one', label: 'product', required: true },
      reverse: { on: 'products', has: 'many', label: 'inventoryLines' },
    },
    commandOperationVenue: {
      forward: { on: 'commandOperations', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'commandOperations' },
    },
    commandOperationDevice: {
      forward: { on: 'commandOperations', has: 'one', label: 'device' },
      reverse: { on: 'devices', has: 'many', label: 'commandOperations' },
    },
    commandOperationActor: {
      forward: { on: 'commandOperations', has: 'one', label: 'actorEmployee' },
      reverse: { on: 'employees', has: 'many', label: 'commandOperations' },
    },
    commandOperationAdminUser: {
      forward: { on: 'commandOperations', has: 'one', label: 'adminUser' },
      reverse: { on: '$users', has: 'many', label: 'commandOperations' },
    },
    commandClaimOperation: {
      forward: { on: 'commandClaims', has: 'one', label: 'operation', required: true },
      reverse: { on: 'commandOperations', has: 'many', label: 'claims' },
    },
    commandClaimVenue: {
      forward: { on: 'commandClaims', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'commandClaims' },
    },
    financialContributionOperation: {
      forward: { on: 'financialContributions', has: 'one', label: 'operation', required: true },
      reverse: { on: 'commandOperations', has: 'many', label: 'financialContributions' },
    },
    financialContributionVenue: {
      forward: { on: 'financialContributions', has: 'one', label: 'venue', required: true },
      reverse: { on: 'venues', has: 'many', label: 'financialContributions' },
    },
    financialContributionOrder: {
      forward: { on: 'financialContributions', has: 'one', label: 'order', required: true },
      reverse: { on: 'orders', has: 'many', label: 'financialContributions' },
    },
    financialContributionPayment: {
      forward: { on: 'financialContributions', has: 'one', label: 'payment', required: true },
      reverse: { on: 'payments', has: 'many', label: 'financialContributions' },
    },
  },
});

type _AppSchema = typeof _schema;
export interface AppSchema extends _AppSchema {}

export default _schema;
