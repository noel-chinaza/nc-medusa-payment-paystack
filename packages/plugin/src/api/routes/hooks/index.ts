import { Application, Router } from "express"
import bodyParser from "body-parser"
import { wrapHandler } from "@medusajs/medusa"
import paystackWebhookHandler from "./paystack"

const route = Router()

export default (app: Application) => {
  app.use("/paystack/hooks", route)

  route.use(bodyParser.json())
  route.post("/", wrapHandler(paystackWebhookHandler))

  return app
}
