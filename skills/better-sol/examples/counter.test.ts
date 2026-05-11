import { describe, expect, test } from "bun:test"
import { createTestContext } from "@better-sol/test"
import { counter } from "./counter"

describe("counter", () => {
  test("authority can increment", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const counterAddress = await ctx.counter.accounts.Counter.derive({ authority: ctx.payer })

    await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
    await ctx.counter.increment({ counter: counterAddress, amount: 2n })

    const data = await ctx.counter.accounts.Counter.fetch(counterAddress)
    expect(data?.count).toBe(2n)
  })

  test("different signer cannot increment", async () => {
    const ctx = await createTestContext({ programs: { counter } })
    const attacker = await ctx.newSigner()
    const counterAddress = await ctx.counter.accounts.Counter.derive({ authority: ctx.payer })

    await ctx.counter.initialize({ counter: counterAddress, initialValue: 0n })
    const attackerClient = await ctx.as(attacker)

    await expect(attackerClient.counter.increment({ counter: counterAddress, amount: 1n })).rejects.toThrow()
  })
})
