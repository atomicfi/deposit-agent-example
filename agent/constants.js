// The bank account the user's paycheck is switched to. In a real app this is
// the user's own account at your bank; here it's Atomic's example account,
// which works in the sandbox. Atomic shows title in Transact.
// https://docs.atomicfi.com/reference/api#access-token__create-access-token
export const DEPOSIT_ACCOUNTS = [
  {
    accountNumber: '220000000',
    routingNumber: '110000000',
    type: 'checking',
    title: 'Premier Plus Checking'
  }
]
