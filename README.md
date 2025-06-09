# Expense Splitter Backend

A MERN stack backend for splitting expenses among groups, with Google Pay-like split functionality (equal, exact amount, or percentage-based splits).

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone https://github.com/dhiraj1155/splitwise-app-backend.git
   cd expense-splitter-backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the root directory and add:
   ```
   MONGODB_URI=your_mongodb_atlas_connection_string
   ```

4. **Run Locally**
   ```bash
   npm run dev
   ```

## API Documentation

### Expense Management
- **GET /expenses**: List all expenses
- **POST /expenses**: Add a new expense
  ```json
  {
    "amount": 60.00,
    "description": "Dinner at restaurant",
    "paid_by": "Shantanu",
    "split_type": "EQUAL",
    "splits": [
      { "person": "Shantanu" },
      { "person": "Sanket" },
      { "person": "Om" }
    ]
  }
  ```
- **PUT /expenses/:id**: Update an expense
- **DELETE /expenses/:id**: Delete an expense

### Settlement Calculations
- **GET /settlements**: Get optimized settlement summary
- **GET /balances**: Get each person's balance
- **GET /people**: List all people derived from expenses

### Settlement Logic
- Calculates balances by summing what each person paid minus their share
- Supports EQUAL, EXACT, and PERCENTAGE split types
- Simplifies settlements to minimize transactions
- Handles floating-point precision using `.toFixed(2)`

### Known Limitations
- No authentication implemented
- No recurring transactions or categories (optional features not included)
- Assumes all people in splits are valid; no separate person creation

## Deployment on Render
1. Create a MongoDB Atlas cluster and get the connection string
2. Push code to a GitHub repository
3. In Render dashboard:
   - Create a new Web Service
   - Connect to your GitHub repo
   - Set Root Directory to `/`
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add Environment Variable: `MONGODB_URI`
4. Deploy and verify the provided URL

## Postman Collection
Available at: https://gist.github.com/dhiraj1155/59c20635d5d9205197bbf3a2ba657d3a
- Includes all endpoints with sample requests
- Pre-populated with test data for Shantanu, Sanket, Om
- Uses deployed API base URL
