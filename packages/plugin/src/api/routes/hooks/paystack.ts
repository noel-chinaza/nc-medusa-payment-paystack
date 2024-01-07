import { createHmac } from 'crypto';
import PaystackPaymentProcessor from "../../../services/paystack-payment-processor";
import { Request, Response } from 'express';
import { PaymentRepository } from '@medusajs/medusa/dist/repositories/payment';
import { Payment } from '@medusajs/medusa';

export default async (req: Request, res: Response) => {
  const paystackPaymentProcessorService: PaystackPaymentProcessor = req.scope.resolve(
    "paystackPaymentProcessorService"
  )
  const isAuthentic = await paystackPaymentProcessorService.verifyWebhook(req.body, req.headers['x-paystack-signature'] as any);
  if (isAuthentic) {

    const paymentRepository: typeof PaymentRepository =
      req.scope.resolve("paymentRepository");
    const manager: any = req.scope.resolve("manager");
    const paymentRepo = manager.withRepository(paymentRepository);


    const payment: Payment = await paymentRepo.findOne({
      where: {
        data: {
          paystackTxId: req.body.data.id
        }
      }
    });

    await autorizeCart(req, payment.cart_id);
  }
  res.send(200);



  async function autorizeCart(req: Request, cartId: string) {
    const manager = req.scope.resolve("manager")
    const cartService = req.scope.resolve("cartService")
    const swapService = req.scope.resolve("swapService")
    const orderService = req.scope.resolve("orderService")

    await manager.transaction(async (m: any) => {
      const cart = await cartService.withTransaction(m).retrieve(cartId)

      switch (cart.type) {
        case "swap": {
          const swap = await swapService
            .withTransaction(m)
            .retrieveByCartId(cartId)
            .catch((_: any) => undefined)

          if (swap && swap.confirmed_at === null) {
            await cartService
              .withTransaction(m)
              .setPaymentSession(cartId, "paystack")
            await cartService.withTransaction(m).authorizePayment(cartId)
            await swapService.withTransaction(m).registerCartCompletion(swap.id)
          }
          break
        }

        default: {
          const order = await orderService
            .withTransaction(m)
            .retrieveByCartId(cartId)
            .catch((_: any) => undefined)

          if (!order) {
            await cartService
              .withTransaction(m)
              .setPaymentSession(cartId, "paystack")
            await cartService.withTransaction(m).authorizePayment(cartId)
            await orderService.withTransaction(m).createFromCart(cartId)
          }
          break
        }
      }
    })
  }
}
