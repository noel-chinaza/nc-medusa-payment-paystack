import { PaymentSession } from '@medusajs/medusa';
import PaymentSessionRepository from '@medusajs/medusa/dist/repositories/payment-session';
import { Request, Response } from 'express';
import PaystackPaymentProcessor from "../../../services/paystack-payment-processor";

export default async (req: Request, res: Response) => {
  const paystackPaymentProcessorService: PaystackPaymentProcessor = req.scope.resolve(
    "paystackPaymentProcessorService"
  )
  const isAuthentic = await paystackPaymentProcessorService.verifyWebhook(req.body, req.headers['x-paystack-signature'] as any);
  if (isAuthentic) {

    const paymentSessionRepository: typeof PaymentSessionRepository =
      req.scope.resolve("paymentSessionRepository");
    const manager: any = req.scope.resolve("manager");
    const paymentSessionRepo = manager.withRepository(paymentSessionRepository);

    console.error('paystack payload', JSON.stringify(req.body));
    switch (req.body.event) {
      case "charge.success":
        const paymentSession: PaymentSession = await paymentSessionRepo.findOne({
          where: {
            provider_id: PaystackPaymentProcessor.identifier,
            data: {
              paystackTxRef: req.body.data.reference
            }
          }
        });

        await autorizeCart(req, paymentSession.cart_id!);
        break;
    }
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
