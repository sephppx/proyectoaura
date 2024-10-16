import { neon } from '@neondatabase/serverless';
import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';

dotenv.config();

const sql = neon(process.env.DATABASE_URL);
const CLAVE_SECRETA = process.env.CLAVE_SECRETA;
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

app.use('/files', express.static('public'));

// Pagina Main
app.get('/', (req, res) => {
  console.log('Renderizando la página de inicio');
  res.render('home');
});

// Admin - Admin_Perfiles - Admin_Productos
app.get('/Admin', (req, res) => {
  res.render('Admin');
});

// Asegúrate de aplicar el middleware también a las otras rutas admin
app.get('/Adminprod', (req, res) => {
  res.render('Adminprod');
});

app.get('/Adminperfiles', (req, res) => {
  res.render('Adminperfiles');
});

// formulario_editar - formulario_agregar
app.get('/formularioedit', (req, res) => {
  res.render('formularioedit');
});

app.get('/formulariopro', (req, res) => {
  res.render('formulariopro');
});

// Checkout
app.get('/checkout', (req, res) => {
  res.render('checkout');
});

// Login - Register
app.get('/login', (req, res) => {
  const message = req.query.message;
  res.render('login', { message });
});

app.get('/register', (req, res) => {
  res.render('register');
});

// Lista de pedidos 
app.get('/recibos', (req, res) => {
  const error = req.query.error;
  res.render('recibos', { error });
});

// Wallet
app.get('/wallet', (req, res) => {
  res.render('wallet');
});

app.post('/login', async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  const query = 'SELECT id, password FROM users WHERE email = $1';
  const results = await sql(query, [email]);


  if (results.length === 0) {
    return res.render('login', { message: "Correo o contraseña incorrectos." });
  }

  const id = results[0].id;
  const hash = results[0].password;

  if (bcrypt.compareSync(password, hash)) {
    const fiveMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = jwt.sign(
      { id, exp: fiveMinutesFromNowInSeconds },
      CLAVE_SECRETA
    );

    res.cookie(AUTH_COOKIE_NAME, token, { maxAge: 60 * 5 * 1000 });
    res.redirect(302, '/');
    return;
  } 

  res.redirect('/login');
});

app.post('/register', async (req, res) => {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;

  const checkQuery = 'SELECT id FROM users WHERE email = $1';
  const existingUser = await sql(checkQuery, [email]);

    
    if (existingUser.length > 0) {
      return res.render('register', { error: "El correo electrónico ya está registrado." });
    }

  try {
    
    
    const hash = bcrypt.hashSync(password, 5); 
    const query = 'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id';

    
    const results = await sql(query, [name, email, hash]);
    const id = results[0].id;

    
    const fiveMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = jwt.sign({ id, exp: fiveMinutesFromNowInSeconds }, CLAVE_SECRETA);

    
    res.cookie(AUTH_COOKIE_NAME, token, { maxAge: 60 * 5 * 1000 });
    return res.redirect(302, '/'); 
  } catch (error) {
    return res.render('register', { error: "Hubo un problema al registrarse. Intenta nuevamente." });
  }
});

app.get('/logout', (req, res) => {
  res.cookie(AUTH_COOKIE_NAME, '', { maxAge: 1 });
  res.send('deslogeao');
});

app.listen(3000, () => console.log('Servidor encendido en el puerto 3000'));