/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/hb_capital_smartcontract.json`.
 */
export type HbCapitalSmartcontract = {
  address: '8SPueaEQmPzs9rHUEv789r1P89zq7e4fWnQmCnKXTdEV'
  metadata: {
    name: 'hbCapitalSmartcontract'
    version: '0.1.1'
    spec: '0.1.0'
    description: 'Making our transactions more transparent and easy verifiable'
  }
  instructions: [
    {
      name: 'addAction'
      discriminator: [96, 90, 68, 182, 95, 52, 192, 101]
      accounts: [
        {
          name: 'signer'
          writable: true
          signer: true
        },
        {
          name: 'position'
          writable: true
          pda: {
            seeds: [
              {
                kind: 'const'
                value: [112, 111, 115]
              },
              {
                kind: 'arg'
                path: 'ticker'
              },
              {
                kind: 'arg'
                path: 'id'
              },
              {
                kind: 'account'
                path: 'signer'
              }
            ]
          }
        }
      ]
      args: [
        {
          name: 'ticker'
          type: 'string'
        },
        {
          name: 'id'
          type: 'u64'
        },
        {
          name: 'actionType'
          type: 'u8'
        },
        {
          name: 'time'
          type: 'i64'
        },
        {
          name: 'setTo'
          type: 'u64'
        }
      ]
    },
    {
      name: 'addOrder'
      discriminator: [119, 178, 239, 1, 189, 29, 253, 254]
      accounts: [
        {
          name: 'signer'
          writable: true
          signer: true
        },
        {
          name: 'position'
          writable: true
          pda: {
            seeds: [
              {
                kind: 'const'
                value: [112, 111, 115]
              },
              {
                kind: 'arg'
                path: 'ticker'
              },
              {
                kind: 'arg'
                path: 'id'
              },
              {
                kind: 'account'
                path: 'signer'
              }
            ]
          }
        }
      ]
      args: [
        {
          name: 'ticker'
          type: 'string'
        },
        {
          name: 'id'
          type: 'u64'
        },
        {
          name: 'orderType'
          type: 'u8'
        },
        {
          name: 'price'
          type: 'u64'
        },
        {
          name: 'size'
          type: 'u64'
        }
      ]
    },
    {
      name: 'initialize'
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237]
      accounts: [
        {
          name: 'signer'
          writable: true
          signer: true
        },
        {
          name: 'position'
          writable: true
          pda: {
            seeds: [
              {
                kind: 'const'
                value: [112, 111, 115]
              },
              {
                kind: 'arg'
                path: 'ticker'
              },
              {
                kind: 'arg'
                path: 'id'
              },
              {
                kind: 'account'
                path: 'signer'
              }
            ]
          }
        },
        {
          name: 'systemProgram'
          address: '11111111111111111111111111111111'
        }
      ]
      args: [
        {
          name: 'ticker'
          type: 'string'
        },
        {
          name: 'id'
          type: 'u64'
        },
        {
          name: 'side'
          type: 'u8'
        },
        {
          name: 'bump'
          type: 'u8'
        }
      ]
    }
  ]
  accounts: [
    {
      name: 'position'
      discriminator: [170, 188, 143, 228, 122, 64, 247, 208]
    }
  ]
  errors: [
    {
      code: 6000
      name: 'unathorized'
      msg: 'unauthorized'
    }
  ]
  types: [
    {
      name: 'action'
      type: {
        kind: 'struct'
        fields: [
          {
            name: 'actionType'
            type: 'u8'
          },
          {
            name: 'time'
            type: 'i64'
          },
          {
            name: 'setTo'
            type: 'u64'
          }
        ]
      }
    },
    {
      name: 'order'
      type: {
        kind: 'struct'
        fields: [
          {
            name: 'orderType'
            type: 'u8'
          },
          {
            name: 'price'
            type: 'u64'
          },
          {
            name: 'size'
            type: 'u64'
          }
        ]
      }
    },
    {
      name: 'position'
      type: {
        kind: 'struct'
        fields: [
          {
            name: 'ticker'
            type: 'string'
          },
          {
            name: 'side'
            type: 'u8'
          },
          {
            name: 'actions'
            type: {
              vec: {
                defined: {
                  name: 'action'
                }
              }
            }
          },
          {
            name: 'orders'
            type: {
              vec: {
                defined: {
                  name: 'order'
                }
              }
            }
          }
        ]
      }
    }
  ]
}
