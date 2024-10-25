import { neon } from '@neondatabase/serverless';
import express from 'express';
import { engine } from 'express-handlebars';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import pkg from 'jsonwebtoken';
import { auth, adminMiddleware } from './middlewares/auth.js';
import path from 'path';



dotenv.config();

const sql = neon(process.env.DATABASE_URL);
export const CLAVE_SECRETA = process.env.CLAVE_SECRETA;
export const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME;
const { verify } = pkg;

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.engine('handlebars', engine());
app.set('view engine', 'handlebars');
app.set('views', './views');

app.use('/files', express.static('public'));

// Pagina Main
app.get('/', auth, async (req, res) => {
  try {
    const firstProductsQuery = 'SELECT id, nombre, precio, imagen_url FROM productos ORDER BY id ASC LIMIT 4';
    const firstProducts = await sql(firstProductsQuery); // Obtener los primeros productos

    // Consulta para obtener los productos
    const query = 'SELECT id, nombre, precio, imagen_url FROM productos ORDER BY id ASC';
    const productos = await sql(query); // Obtener los productos de la base de datos

    // Pasar los productos a la vista home
    res.render('home', { name: req.user.name, monto: req.user.monto, productos, firstProducts });
  } catch (error) {
    console.error("Error al cargar los productos:", error);
    res.redirect('/login');
  }
});

// Admin - Admin_Perfiles - Admin_Productos
app.get('/Admin', auth, adminMiddleware, (req, res) => {
  res.render('Admin', { isAdmin: true, userName: req.user.name });
});

app.get('/Adminprod', async (req, res) => {
  try {
    const query = 'SELECT * FROM productos ORDER BY id ASC';
    const results = await sql(query);

    res.render('Adminprod', { productos: results });
  } catch (error) {
    console.error("Error al obtener productos:", error);
    res.render('Adminprod', { error: "No se pudieron cargar los productos." });
  }
});


app.get('/Adminperfiles', (req, res) => {
  res.render('Adminperfiles');
});

// formulario_editar - formulario_agregar
app.get('/formularioedit', async (req, res) => {
  const id = req.query.id; // Obtener el ID del producto de la URL

  try {
    // Consultar el producto por ID
    const query = 'SELECT id, nombre, stock, precio, imagen_url FROM productos WHERE id = $1';
    const result = await sql(query, [id]);

    if (result.length === 0) {
      return res.status(404).send('Producto no encontrado');
    }

    const producto = result[0]; // Obtener el primer resultado (el producto)
    
    // Renderizar la vista de edición con los datos del producto
    res.render('formularioedit', { producto });
  } catch (error) {
    console.error("Error al obtener el producto:", error);
    res.status(500).send('Error al cargar el producto');
  }
});


app.get('/formulariopro', async (req, res) => {
  res.render('formulariopro');
});

// Eliminar Producto
app.get('/eliminarpro', async (req, res) => {
  const id = req.query.id; // Obtener el ID del producto de la URL
  if (!id) {
      return res.status(400).send('ID de producto no proporcionado');
  }
  res.render('eliminarpro', { producto_id: id }); // Pasar el id a la vista
});

// Checkout
app.get('/checkout', (req, res) => {
  res.render('checkout');
});

// Login - Register
app.get('/login', (req, res) => {
  const error = req.query.error;
  res.render('login', { error });
});

app.get('/register', (req, res) => {
  const error = req.query.error;
  res.render('register', { error });
});

// Lista de pedidos 
app.get('/recibos', auth, (req, res) => {
  try {
    console.log("User-Recibos: ", req.user);
    res.render('recibos', { name: req.user.name, monto: req.user.monto });
} catch (error) {
    console.error(error);
    return res.redirect('/login');
}
});

// Wallet
app.get('/wallet', auth, async (req, res) => {
  try {
    console.log("User-Wallets: ", req.user);
    res.render('wallet', { name: req.user.name, monto: req.user.monto });
} catch (error) {
    console.error(error);
    return res.redirect('/login');
}
});

app.post('/login', async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  const query = 'SELECT id, password, name, role FROM users WHERE email = $1';
  const results = await sql(query, [email]);
  if (results.length === 0) {
    return res.render('login', { error: "Usuario no registrado." });
  }

  const id = results[0].id;
  const hash = results[0].password;
  const name = results[0].name;
  const role = results[0].role;

  if (bcrypt.compareSync(password, hash)) {

    const walletQuery = 'SELECT monto FROM wallet WHERE user_id = $1';
    const walletResults = await sql(walletQuery, [id]);
    if (walletResults.length === 0) {
      return res.render('login', { error: "No se encontró una wallet asociada." });
    }

    const monto = walletResults[0].monto;

    const fiveMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = jwt.sign(
      { id, name, role, monto, exp: fiveMinutesFromNowInSeconds },
      CLAVE_SECRETA
    );

    res.cookie(AUTH_COOKIE_NAME, token, { maxAge: 60 * 5 * 1000 });
    res.redirect(302, '/');
    return;
  }

  res.redirect('/login?error=Correo o contraseña incorrectos.');
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

    const walletQuery = 'INSERT INTO wallet (user_id, monto) VALUES ($1, $2)';
    await sql(walletQuery, [id, 100000.00]);
   
    const fiveMinutesFromNowInSeconds = Math.floor(Date.now() / 1000) + 5 * 60;
    const token = jwt.sign({ id, exp: fiveMinutesFromNowInSeconds }, CLAVE_SECRETA);

    
    res.cookie(AUTH_COOKIE_NAME, token, { maxAge: 60 * 5 * 1000 });
    return res.redirect(302, '/login'); 
  } catch (error) {
    return res.render('register', { error: "Hubo un problema al registrarse. Intenta nuevamente." });
  }
});

app.post('/formulariopro', async (req, res) => {
  const nombre = req.body.nombre;
  const stock = req.body.stock;
  const precio = req.body.precio;
  const imagen_url = req.body.imagen_url;

  // Validaciones simples
  if (!nombre || stock < 0 || precio < 0 || !imagen_url) {
    return res.render('formulariopro', { error: "Por favor, completa todos los campos correctamente." });
  }

  const query = 'INSERT INTO productos (nombre, stock, precio, imagen_url) VALUES ($1, $2, $3, $4) RETURNING id';

  try {
    const results = await sql(query, [nombre, stock, precio, imagen_url]);
    const id = results[0].id;
    
    // Redirige a la lista de productos o a una página de éxito
    res.redirect(302, '/Adminprod'); 
  } catch (error) {
    console.error(error);
    return res.render('formulariopro', { error: "Hubo un problema al registrar el producto. Intenta nuevamente." });
  }
});

app.post('/formularioedit/producto/:id', async(req, res) => {
  const productId = req.params.id
  const {nombre, stock, precio, imagen_url} = req.body

  try {
    await sql('UPDATE productos SET nombre = $1, stock=$2, precio=$3, imagen_url=$4 WHERE id=$5;', [nombre, stock, precio, imagen_url, productId])
    return res.redirect('/Adminprod')

  } catch(error){
    console.log(error)
    return res.send('HUBO UN ERROR')
  }

})

app.post('/eliminarpro', async (req, res) => {
  const productoId = req.body.producto_id; // Obtener el ID del producto desde el formulario
  if (!productoId) {
      return res.status(400).send('ID de producto no proporcionado');
  }

  try {
      const query = 'DELETE FROM productos WHERE id = $1';
      await sql(query, [productoId]); // Eliminar el producto de la base de datos
      res.redirect('/Adminprod'); // Redirigir a la lista de productos
  } catch (error) {
      console.error(error);
      res.status(500).send('Error al eliminar el producto');
  }
});

app.post('/Adminprod', auth, async (req, res) => {
  const productoId = req.body.id; // Obtener el ID del producto desde el formulario
  try {
    const query = 'DELETE FROM productos WHERE id = $1';
    await sql(query, [productoId]); // Eliminar el producto de la base de datos
    res.redirect('/Adminprod'); // Redirigir a la lista de productos
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al eliminar el producto');
  }
});

app.post('/wallet/add', auth, async (req, res) => {
  const userId = req.user.id;
  const { amount } = req.body;

  // Validar la cantidad ingresada
  if (!amount || amount <= 0) {
    return res.render('wallet', { error: "Por favor, ingresa una cantidad válida." });
  }

  try {
    const query = 'UPDATE wallet SET monto = monto + $1 WHERE user_id = $2 RETURNING monto';
    const result = await sql(query, [amount, userId]); 

   
    console.log("Resultado de la consulta:", result); 

    
    if (!result || result.length === 0) {
      return res.render('wallet', { error: "No se encontró la wallet del usuario." });
    }

    
    const newAmount = result[0].monto;

   
    const updatedToken = jwt.sign(
      { id: req.user.id, name: req.user.name, role: req.user.role, monto: newAmount, exp: req.user.exp },
      CLAVE_SECRETA
    );

    
    res.cookie(AUTH_COOKIE_NAME, updatedToken, { maxAge: 60 * 5 * 1000 }); 

    res.redirect('/wallet'); 
  } catch (error) {
    console.error("Error al agregar dinero:", error);
    res.render('wallet', { error: "Error al agregar dinero." });
  }
});

app.get('/logout', (req, res) => {
  res.cookie(AUTH_COOKIE_NAME, '', { maxAge: 1 });
  res.render('login');
});

app.listen(3000, () => console.log('Servidor encendido en el puerto 3000'));