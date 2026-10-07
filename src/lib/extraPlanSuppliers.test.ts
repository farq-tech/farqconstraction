import { expect, it } from 'vitest'
import { extraPlanSuppliers } from './extraPlanSuppliers'
import type { SupplierPlan } from './supplierPlan'
it('unions scope, excludes invited, weak and unreachable suppliers beyond the default selection', () => {
 const s=(id:string, patch={})=>({id,tier:'STRONG',sendable:true,...patch})
 const plan={selection:[],contractors:[],lines:[
  {key:'A',suppliers:[s('new'),s('old',{invited:true}),s('weak',{tier:'MEDIUM'}),s('offline',{sendable:false})]},
  {key:'B',suppliers:[s('new'),s('old')]},
 ]} as unknown as SupplierPlan
 expect(extraPlanSuppliers(plan)).toEqual([{external_key:'new',line_keys:['A','B']}])
})
