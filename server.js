const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Expense Schema
const expenseSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  description: { type: String, required: true, trim: true },
  paid_by: { type: String, required: true, trim: true },
  split_type: { 
    type: String, 
    enum: ['EQUAL', 'EXACT', 'PERCENTAGE'], 
    default: 'EQUAL' 
  },
  splits: [{
    person: { type: String, required: true, trim: true },
    amount: { type: Number, min: 0 },
    percentage: { type: Number, min: 0, max: 100 }
  }],
  created_at: { type: Date, default: Date.now }
});

const Expense = mongoose.model('Expense', expenseSchema);

// Helper function for settlement calculations
const calculateSettlements = async () => {
  const expenses = await Expense.find();
  const balances = {};
  const people = new Set();

  // Calculate balances
  expenses.forEach(expense => {
    const { amount, paid_by, split_type, splits } = expense;
    people.add(paid_by);
    
    // Initialize balances
    if (!balances[paid_by]) balances[paid_by] = 0;
    splits.forEach(split => {
      if (!balances[split.person]) balances[split.person] = 0;
      people.add(split.person);
    });

    // Process splits based on type
    if (split_type === 'EQUAL') {
      const share = amount / splits.length;
      splits.forEach(split => {
        balances[split.person] -= share;
      });
      balances[paid_by] += amount;
    } else if (split_type === 'EXACT') {
      splits.forEach(split => {
        balances[split.person] -= split.amount;
      });
      balances[paid_by] += amount;
    } else if (split_type === 'PERCENTAGE') {
      splits.forEach(split => {
        const share = (split.percentage / 100) * amount;
        balances[split.person] -= share;
      });
      balances[paid_by] += amount;
    }
  });

  // Simplify settlements
  const settlements = [];
  const debtors = Object.entries(balances)
    .filter(([_, balance]) => balance < -0.01)
    .sort((a, b) => a[1] - b[1]);
  const creditors = Object.entries(balances)
    .filter(([_, balance]) => balance > 0.01)
    .sort((a, b) => b[1] - a[1]);

  while (debtors.length > 0 && creditors.length > 0) {
    const [debtor, debt] = debtors[0];
    const [creditor, credit] = creditors[0];
    const amount = Math.min(-debt, credit);

    if (amount > 0.01) {
      settlements.push({
        from: debtor,
        to: creditor,
        amount: Number(amount.toFixed(2))
      });
    }

    debtors[0][1] += amount;
    creditors[0][1] -= amount;

    if (Math.abs(debtors[0][1]) < 0.01) debtors.shift();
    if (Math.abs(creditors[0][1]) < 0.01) creditors.shift();
  }

  return { balances, settlements, people: Array.from(people) };
};

// API Endpoints
app.get('/expenses', async (req, res) => {
  try {
    const expenses = await Expense.find();
    res.json({ success: true, data: expenses });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.post('/expenses', async (req, res) => {
  try {
    const { amount, description, paid_by, split_type = 'EQUAL', splits = [] } = req.body;

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be positive' });
    }
    if (!description) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }
    if (!paid_by) {
      return res.status(400).json({ success: false, message: 'Paid_by is required' });
    }

    // Validate splits
    if (split_type === 'EXACT') {
      const totalSplit = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
      if (Math.abs(totalSplit - amount) > 0.01) {
        return res.status(400).json({ success: false, message: 'Split amounts must equal total amount' });
      }
    } else if (split_type === 'PERCENTAGE') {
      const totalPercentage = splits.reduce((sum, split) => sum + (split.percentage || 0), 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        return res.status(400).json({ success: false, message: 'Percentages must sum to 100' });
      }
    } else {
      // For EQUAL split, ensure splits array has valid people
      if (splits.length === 0) {
        return res.status(400).json({ success: false, message: 'At least one person must be included in split' });
      }
    }

    const expense = new Expense({ amount, description, paid_by, split_type, splits });
    await expense.save();
    res.status(201).json({ success: true, data: expense, message: 'Expense added successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.put('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, paid_by, split_type, splits } = req.body;

    // Validation
    if (amount && amount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be positive' });
    }
    if (description && !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }
    if (paid_by && !paid_by.trim()) {
      return res.status(400).json({ success: false, message: 'Paid_by is required' });
    }

    const expense = await Expense.findById(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    // Update fields
    if (amount) expense.amount = amount;
    if (description) expense.description = description;
    if (paid_by) expense.paid_by = paid_by;
    if (split_type) expense.split_type = split_type;
    if (splits) {
      if (split_type === 'EXACT') {
        const totalSplit = splits.reduce((sum, split) => sum + (split.amount || 0), 0);
        if (Math.abs(totalSplit - (amount || expense.amount)) > 0.01) {
          return res.status(400).json({ success: false, message: 'Split amounts must equal total amount' });
        }
      } else if (split_type === 'PERCENTAGE') {
        const totalPercentage = splits.reduce((sum, split) => sum + (split.percentage || 0), 0);
        if (Math.abs(totalPercentage - 100) > 0.01) {
          return res.status(400).json({ success: false, message: 'Percentages must sum to 100' });
        }
      }
      expense.splits = splits;
    }

    await expense.save();
    res.json({ success: true, data: expense, message: 'Expense updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.delete('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByIdAndDelete(id);
    if (!expense) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/settlements', async (req, res) => {
  try {
    const { settlements } = await calculateSettlements();
    res.json({ success: true, data: settlements });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/balances', async (req, res) => {
  try {
    const { balances } = await calculateSettlements();
    res.json({ success: true, data: balances });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/people', async (req, res) => {
  try {
    const { people } = await calculateSettlements();
    res.json({ success: true, data: people });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));