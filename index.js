import { neon } from '@neondatabase/serverless';
import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);

const app = express();

app.engine('handlebars', engine());

app.set('view engine', 'handlebars');
app.set('views', './views');

app.use('/files', express.static('public'));

// Pagina Main
app.get('/', (req, res) => {
  console.log('Renderizando la página de inicio');
  res.render('home');
});

// Admin
app.get('/Admin', (req, res) => {
  res.render('Admin');
});

app.get('/Adminprod', (req, res) => {
  res.render('Adminprod');
});

app.get('/Adminperfiles', (req, res) => {
  res.render('Adminperfiles');
});

app.get('/checkout', (req, res) => {
  res.render('checkout');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.get('/recibos', (req, res) => {
  res.render('recibos');
});

app.get('/wallet', (req, res) => {
  res.render('wallet');
});

app.listen(3000, () => console.log('Servidor encendido en el puerto 3000'));