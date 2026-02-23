# 🚀 CodeCodely — Stellar-Based Code Snippet Platform

CodeCodely is a **Stellar-powered code snippet management platform** that enables developers to **store, edit, and manage code snippets securely**.  
It combines a **modern gradient-based UI**, smooth animations, and **blockchain-backed ownership** to deliver a future-ready developer experience.

Built with **Next.js, TypeScript, Tailwind CSS**, and **NeonDB**, CodeCodely is designed for performance, scalability, and Web3 integration.

---

## ✨ Key Features

- 🌈 **Modern Landing Page**
  - Gradient backgrounds
  - Smooth animations
  - Clear call-to-action buttons (Join / Add Snippet)

- 🧩 **Code Snippet Management**
  - Add, edit, and save code snippets
  - Store snippet title, programming language, and code
  - Persistent database storage using PostgreSQL (NeonDB)

- 🌐 **Stellar Blockchain Integration**
  - Snippets linked to Stellar wallet addresses
  - Wallet-based ownership model
  - Ready for decentralized extensions such as:
    - Snippet NFTs
    - On-chain verification
    - Permission-based access

- ⚡ **High Performance & Developer Experience**
  - Next.js App Router
  - Server Actions for backend logic
  - Fully type-safe with TypeScript
  - Clean and scalable architecture

---

## 🧑‍💻 Tech Stack

### Frontend
- Next.js (App Router)
- TypeScript
- Tailwind CSS
- Framer Motion (Animations)

### Backend & Database
- NeonDB (PostgreSQL)
- Prisma ORM
- Next.js Server Actions

### Blockchain
- Stellar Blockchain
- Stellar SDK
- Wallet-based identity

---

## 🧠 Database Model

```prisma
model Snippet {
  id        String   @id @default(uuid())
  title     String
  language  String
  code      String
  owner     String?  // Stellar wallet address
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```
🔐 Environment Variables

Create a .env file in the root directory:

DATABASE_URL="postgresql://<username>:<password>@<neon-host>/<db-name>?sslmode=require"
NEXT_PUBLIC_STELLAR_NETWORK=testnet

⚙️ Getting Started
1️⃣ Clone the Repository
git clone https://github.com/your-username/codely.git
cd codely

2️⃣ Install Dependencies
npm install

3️⃣ Setup Database
npx prisma generate
npx prisma migrate dev

4️⃣ Run the App
npm run dev


Open http://localhost:3000
 in your browser.

🧪 Core Functionality
➕ Add Code Snippet

Click Add Snippet

Enter:

Title

Programming Language

Code

Save securely to the database

✏️ Edit Code Snippet

Modify existing snippets

Updates are saved instantly

🌐 Stellar Integration

Snippets are associated with Stellar wallet addresses

Enables ownership-based access

Foundation for on-chain snippet verification

🎯 Roadmap

🔐 Stellar wallet authentication

🪙 Snippet NFTs on Stellar

🏷 Tags and folders

🔍 Search and filtering

### 🌙 Dark Mode Support
Support for dark mode is planned but not yet implemented for the new landing page.

---

## 🎨 Design

The landing page design is available on Figma. External contributors can use it as a reference for UI consistency.

- 📐 **Figma Design Link**: [Codely Landing Page](https://www.figma.com/design/codely-landing-page)

---

## Contributing

Contributions are welcome and highly appreciated! We follow a structured contribution process to maintain code quality and consistency.

**Please read our comprehensive [CONTRIBUTING.md](./CONTRIBUTING.md) guide before starting to contribute.**

📄 License

This project is licensed under the MIT License.
