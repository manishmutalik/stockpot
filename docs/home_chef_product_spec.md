# Product Specification: Home Chef Management Platform

This document outlines the features of the current Bakery Application, combined with the proposed commercial features designed specifically to serve the Home Chef and independent Home Baker market.

---

## Part 1: Current Application Capabilities
These features are already fully developed, deployed, and synchronizing in real-time across both the Web Dashboard and the native Mobile Application (iOS/Android) via Firebase.

### 1. Advanced Inventory Management
- **Ingredient-Level Tracking:** Track raw materials (flour, sugar, butter) and packaging materials with precise metric conversions (grams to kilograms, milliliters to liters).
- **Moving Average Cost (MAC):** A sophisticated financial engine that calculates the true blended cost of inventory. When restocking materials at fluctuating market prices, the system automatically recalibrates the `Cost Per Unit` based on the old stock value plus the new purchase value.
- **Low Stock Alerts:** Visual indicators for items that fall below their designated minimum threshold.
- **Multi-Tier GST Support:** Ability to assign specific GST rates (0%, 5%, 12%, 18%) to individual raw materials. The restock engine logs the base price to inventory value while isolating the tax for Input Tax Credit (ITC) compliance.

### 2. Recipe & Menu Engineering
- **Bill of Materials (BoM):** Create complex recipes by attaching raw materials to a menu item. The system automatically converts units (e.g., pulling 250g of flour from a 50kg sack) and calculates the exact cost to produce the item.
- **Dynamic Costing & Margins:** The recipe cost updates in real-time if underlying raw material prices change. The system clearly displays the current profit margin percentage based on the selling price.
- **5% Output GST Calculation:** Automatically calculates a flat 5% GST surcharge on top of the base recipe cost, ensuring the final selling price covers output tax liabilities.
- **Suggested Pricing:** One-click algorithm that suggests an optimal selling price based on a standard 3.5x markup of the raw material cost.

### 3. Order Logging & Financial Reporting
- **Automated Stock Deduction:** When an order is logged, the system automatically deducts the exact fractional amounts of every raw material used in that recipe from the master inventory.
- **Financial Dashboards:** Real-time graphs showing daily, weekly, and monthly revenue trends.
- **Integrated GST Revenue:** Total Revenue calculations explicitly include the 5% GST collected on sales, providing a true picture of cash flow.
- **R&D Tracking:** A dedicated "Experiments" tab allowing chefs to log wasted ingredients during recipe testing without inflating their sales revenue.

---

## Part 2: Proposed Commercial SaaS Features (The "Home Chef" Expansion)
To transition this powerful internal engine into a marketable SaaS product for independent creators, the following features will be built on top of the existing foundation.

### 1. Digital Storefront & Pre-Orders
- **Link-in-Bio Menus:** Generate a clean, mobile-optimized URL (e.g., `app.com/chef-name`) that chefs can place on their Instagram or Facebook profiles. Customers can view the menu, see pricing, and place orders directly.
- **Custom Order Quotations:** For highly bespoke items (like tiered wedding cakes), customers can submit an inquiry. The chef uses the app's recipe engine to build a custom KOT (Kitchen Order Ticket), calculate the cost, and send a formatted quote back to the customer.

### 2. Order Calendar & CRM Workflow
- **Visual Order Calendar:** Shift from a simple "list of orders" to a visual calendar showing order deadlines, pickup times, and delivery routes.
- **Workflow Statuses:** Track the lifecycle of custom orders: *Inquiry received -> Quote Sent -> Advance Paid -> Baking -> Ready for Pickup*.
- **Advance Payment Tracking:** Ability to log partial payments (e.g., recording a 50% UPI deposit to confirm a booking).
- **Customer Database:** Automatically build a CRM of client names, phone numbers, and order histories to identify and reward repeat customers.

### 3. WhatsApp Integration
- **Automated Confirmations:** When an order is placed via the digital storefront, the app automatically generates and sends a formatted WhatsApp message to both the customer and the chef confirming the details.
- **One-Click Invoicing:** Generate beautiful PDF receipts or text-based invoices that can be shared via WhatsApp to request final payments.

### 4. Smart Production & Sourcing
- **Batch Aggregation:** If a chef has 10 different cake orders due on Saturday, the app aggregates the recipes and generates a single "Master Production List" (e.g., "You need to bake 10kg of vanilla sponge total").
- **Automated Shopping Lists:** Cross-references the upcoming weekend's aggregated orders against current inventory levels to generate a precise grocery shopping list for the market.

### 5. Multi-Tenant SaaS Infrastructure
- **Organization Workspaces:** Upgrading the database so multiple staff members (e.g., the lead chef and a delivery driver) can log into the same bakery workspace with different access permissions.
- **Freemium Billing:** Integrating a payment gateway (Stripe/Razorpay) to offer the core recipe engine for free, while charging a low monthly subscription (e.g., ₹499/month) for access to the WhatsApp storefront and automated shopping lists.
