export type Rule = {
    'Long Entry': boolean[][]
    'Long Exit': boolean[][]
    'Short Entry': boolean[][]
    'Short Exit': boolean[][]
}

export type OrderTypes = 'Long Entry' | 'Long Exit' | 'Short Entry' | 'Short Exit'