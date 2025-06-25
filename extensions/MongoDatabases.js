module.exports = {
    Databases: {
        DumpIt: {
            name: "DumpIt",
            collections: {
                users: "users",
                transactions: "transactions",
                properties: "properties",
                annals: "annals"
            },
            views: {
                allUserTransactions: {
                    title: "All User Transactions",
                    description: "View all transactions for a specific user.",
                    viewName: "viewAllUserTransactions"
                },
                userBalances: {
                    title: "User Balances",
                    description: "View the balances of all users.",
                    viewName: "viewUserBalances"
                }
            }
        },
        DumpIt_EOYTests: {
            name: "DumpIt-EOYTests",
            collections: {
                users: "users",
                transactions: "transactions",
                properties: "properties",
                annals: "annals"
            },
            views: {
                allUserTransactions: {
                    title: "All User Transactions",
                    description: "View all transactions for a specific user.",
                    viewName: "viewAllUserTransactions"
                },
                userBalances: {
                    title: "User Balances",
                    description: "View the balances of all users.",
                    viewName: "viewUserBalances"
                }
            }
        }
    }
}