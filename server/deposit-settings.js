// How this bank lets users split a paycheck. Mirror the Fractional Deposits settings Atomic set up on
// your account in the Atomic Console; Atomic's API doesn't return them, so the server can't read
// them itself.
// https://docs.atomicfi.com/reference/transact-sdk#parameters
export function getDepositSettings() {
  return {
    // Fractional Deposits on: users can move part of a paycheck (a dollar amount or a percentage)
    // when their payroll system allows it. Off: only the whole paycheck.
    fractionalDeposits: process.env.FRACTIONAL_DEPOSITS !== 'false',
    // Whether the user can change, in the Atomic screen, an amount the agent confirmed in chat
    // (Transact's distribution canUpdate). Off by default, so what the user agreed to is what's set.
    canUpdateAmount: process.env.DEPOSIT_AMOUNT_CAN_UPDATE === 'true'
  }
}

// The kinds of split a payroll system allows, narrowed to what this bank allows.
export function allowedDistributionTypes(connector) {
  const types = connector?.capabilities?.distributionTypes ?? []
  return getDepositSettings().fractionalDeposits ? types : types.filter((t) => t === 'total')
}
