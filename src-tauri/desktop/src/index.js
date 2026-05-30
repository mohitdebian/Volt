const express = require('express');
require('dotenv').config();
const authRouter = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/api/auth', authRouter);

app.get('/', (req, res) => {
  res.send('Auth system is running');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
