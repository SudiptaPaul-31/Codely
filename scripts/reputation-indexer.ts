import { Server } from "stellar-sdk/lib/rpc";
import { addReputationPoints, deductReputationPoints } from "../lib/reputation";

// Using testnet RPC URL
const rpcUrl = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const server = new Server(rpcUrl);

const CONTRACT_ID = process.env.REPUTATION_CONTRACT_ID; // Must be set to the deployed contract ID

export async function syncReputationEvents() {
  if (!CONTRACT_ID) {
    console.error("REPUTATION_CONTRACT_ID is not set.");
    return;
  }

  console.log(`Starting reputation event sync for contract ${CONTRACT_ID}...`);

  try {
    // In a real app, you would fetch the last cursor from the database
    let cursor: string | undefined = undefined;

    // Simulate listening to events
    const fetchEvents = async () => {
      try {
        const eventsResponse = await server.getEvents({
          startLedger: 0, // In production, this would be the last synced ledger
          filters: [
            {
              type: "contract",
              contractIds: [CONTRACT_ID],
              topics: [
                ["*", "*", "*", "*"] // Match all topics or specifically "add_points" / "deduct_points"
              ]
            }
          ],
          limit: 100,
          pagination: cursor ? { cursor } : undefined
        });

        for (const event of eventsResponse.events) {
          // Parse event topics and values based on the Rust contract:
          // Topic 0: "add_points" or "deduct_points"
          // Topic 1: user Address
          // Value: (amount, action)
          
          if (event.type !== "contract") continue;
          
          const topic0 = event.topic[0];
          // We assume we parse the user address from topic1 (this requires xdr decoding in reality)
          const userWallet = "simulated_wallet_from_topic"; // Simulated
          const action = "simulated_action";
          const amount = 10;
          
          if (topic0 === "add_points") {
            await addReputationPoints(userWallet, amount, action, event.id);
            console.log(`Synced add_points: ${amount} for ${userWallet}`);
          } else if (topic0 === "deduct_points") {
            await deductReputationPoints(userWallet, amount, action, event.id);
            console.log(`Synced deduct_points: ${amount} for ${userWallet}`);
          }
          cursor = event.pagingToken;
        }

      } catch (e) {
        console.error("Error fetching events:", e);
      }
      
      // Poll every 5 seconds
      setTimeout(fetchEvents, 5000);
    };

    fetchEvents();

  } catch (error) {
    console.error("Failed to start reputation event sync:", error);
  }
}

// If run directly
if (require.main === module) {
  syncReputationEvents();
}
