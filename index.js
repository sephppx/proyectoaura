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

// Configuración de Handlebars con el helper 'eq'
const hbs = engine({
  helpers: {
    eq: (a, b) => a === b, // Helper personalizado para comparar igualdad
  },
});

app.engine('handlebars', hbs); // Utiliza el motor configurado con los helpers
app.set('view engine', 'handlebars');
app.set('views', './views');

app.use('/files', express.static('public'));

//Página Main
app.get('/', auth, async (req, res) => {
  try {
    const firstProductsQuery = 'SELECT id, nombre, precio, imagen_url, stock FROM productos ORDER BY id ASC LIMIT 4';
    const firstProducts = await sql(firstProductsQuery);

    const query = 'SELECT id, nombre, precio, imagen_url, stock FROM productos ORDER BY id ASC';
    const productos = await sql(query);

    // Pasar los productos a la vista home
    res.render('home', { name: req.user.name, monto: req.user.monto, productos, firstProducts });
  } catch (error) {
    console.error("Error al cargar los productos:", error);
    res.redirect('/login');
  }
});


// Función para obtener el carrito del usuario
async function obtenerCarritoUsuario(userId) {
  // Consulta para verificar si el usuario tiene un carrito activo
  const carritoQuery = 'SELECT id FROM carritos WHERE user_id = $1 ORDER BY fecha DESC LIMIT 1';
  const carritoExistente = await sql(carritoQuery, [userId]);

  if (carritoExistente.length > 0) {
    return carritoExistente[0].id;
  } else {
    // Crear un nuevo carrito si no existe uno
    const nuevoCarritoQuery = 'INSERT INTO carritos (user_id) VALUES ($1) RETURNING id';
    const nuevoCarrito = await sql(nuevoCarritoQuery, [userId]);
    return nuevoCarrito[0].id;
  }
}

// Endpoint para añadir un producto al carrito
app.post('/cart/add', auth, async (req, res) => {
  const productoId = req.body.productoId;
  const userId = req.user.id;
  const carritoId = await obtenerCarritoUsuario(userId);

  try {
    // Verificar el stock del producto
    const productoQuery = 'SELECT stock FROM productos WHERE id = $1';
    const producto = await sql(productoQuery, [productoId]);

    if (producto.length === 0 || producto[0].stock <= 0) {
      // Si no hay stock, enviar un mensaje de error
      return res.status(400).json({ error: 'Producto sin stock disponible' });
    }

    // Verificar si el producto ya está en el carrito
    const productoEnCarritoQuery = 'SELECT cantidad FROM carrito_productos WHERE carrito_id = $1 AND producto_id = $2';
    const productoExistente = await sql(productoEnCarritoQuery, [carritoId, productoId]);

    if (productoExistente.length > 0) {
      // Si el producto ya existe, actualizar la cantidad
      const nuevaCantidad = productoExistente[0].cantidad + 1;
      const actualizarCantidadQuery = 'UPDATE carrito_productos SET cantidad = $1 WHERE carrito_id = $2 AND producto_id = $3';
      await sql(actualizarCantidadQuery, [nuevaCantidad, carritoId, productoId]);
    } else {
      // Si el producto no existe, insertarlo con cantidad 1
      const agregarProductoQuery = 'INSERT INTO carrito_productos (carrito_id, producto_id, cantidad) VALUES ($1, $2, 1)';
      await sql(agregarProductoQuery, [carritoId, productoId]);
    }

    // Obtener la información actualizada del carrito
    const productosCarritoQuery = `
      SELECT p.id, p.nombre, p.precio, p.imagen_url, cp.cantidad, (p.precio * cp.cantidad) AS total_producto
      FROM carrito_productos cp
      JOIN productos p ON cp.producto_id = p.id
      WHERE cp.carrito_id = $1
    `;
    const productosCarrito = await sql(productosCarritoQuery, [carritoId]);
    const totalPrice = productosCarrito.reduce((total, item) => total + item.total_producto, 0);

    // Responder con los datos del carrito actualizados
    res.json({ productosCarrito, totalPrice });
  } catch (error) {
    console.error("Error al agregar producto al carrito:", error);
    res.status(500).json({ error: 'Error al agregar producto al carrito' });
  }
});

// Eliminar producto del carrito
app.post('/checkout/remove/:id', auth, async (req, res) => {
  const productoId = req.params.id; // Obtener el ID del producto desde los parámetros de la URL
  const userId = req.user.id;
  const carritoId = await obtenerCarritoUsuario(userId); // Obtener el carrito activo del usuario

  try {
    // Verificar si el producto está en el carrito
    const productoEnCarritoQuery = 'SELECT * FROM carrito_productos WHERE carrito_id = $1 AND producto_id = $2';
    const productoExistente = await sql(productoEnCarritoQuery, [carritoId, productoId]);

    if (productoExistente.length > 0) {
      // Eliminar el producto del carrito
      const eliminarProductoQuery = 'DELETE FROM carrito_productos WHERE carrito_id = $1 AND producto_id = $2';
      await sql(eliminarProductoQuery, [carritoId, productoId]);
    }

    res.redirect('/checkout'); // Redirigir a la página de checkout después de eliminar el producto
  } catch (error) {
    console.error("Error al eliminar producto del carrito:", error);
    res.status(500).send('Error al eliminar producto del carrito');
  }
});


// Checkout
app.get('/checkout', auth, async (req, res) => {
  const userId = req.user.id;
  const carritoId = await obtenerCarritoUsuario(userId);

  try {
      const productosCarritoQuery = `
          SELECT p.id, p.nombre, p.precio, p.imagen_url, cp.cantidad, (p.precio * cp.cantidad) AS total_producto
          FROM carrito_productos cp
          JOIN productos p ON cp.producto_id = p.id
          WHERE cp.carrito_id = $1
      `;
      const productosCarrito = await sql(productosCarritoQuery, [carritoId]);
      console.log(productosCarrito); // Confirmar que imagen_url está presente

      const totalPrice = productosCarrito.reduce((total, item) => total + item.total_producto, 0);

      res.render('checkout', { productosCarrito, totalPrice });
  } catch (error) {
      console.error("Error al cargar el carrito:", error);
      res.status(500).send('Error al cargar el carrito');
  }
});

function addToCart(productId) {
  fetch('/cart/add', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ productoId: productId })
  })
  .then(response => {
    if (!response.ok) {
      // Si la respuesta no es OK, mostrar un mensaje de error
      return response.json().then(data => {
        alert(data.error || "No se pudo agregar el producto al carrito");
        throw new Error(data.error);
      });
    }
    return response.json();
  })
  .then(data => {
    // Actualizar la vista del carrito con la información actualizada
    updateCartView(data.productosCarrito, data.totalPrice);
  })
  .catch(error => console.error("Error al agregar producto al carrito:", error));
}

function payCart() {
  fetch('/cart/pay', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      }
  })
  .then(function(response) {
      if (response.ok) {
          alert("Compra realizada con éxito");
          // Redirigir a la página de checkout con un mensaje de éxito
          res.redirect('/checkout?success=COMPRA REALIZADA');

      } else {
          alert("No se pudo realizar la compra, saldo insuficiente o stock insuficiente.");
      }
  })
  .catch(function(error) {
      console.error("Error al procesar el pago:", error);
  });
}

app.post('/cart/pay', auth, async (req, res) => {
  const userId = req.user.id;
  const carritoId = await obtenerCarritoUsuario(userId);

  try {
    // Consulta para obtener todos los productos en el carrito
    const productosCarritoQuery = `
          SELECT p.id, p.nombre, p.precio, p.imagen_url, cp.cantidad, (p.precio * cp.cantidad) AS total_producto, p.stock
          FROM carrito_productos cp
          JOIN productos p ON cp.producto_id = p.id
          WHERE cp.carrito_id = $1
      `;
    const productosCarrito = await sql(productosCarritoQuery, [carritoId]);

    // Calcular el precio total de los productos en el carrito
    const totalPrice = productosCarrito.reduce((total, item) => total + item.total_producto, 0);

    // **Calcular la cantidad total de productos comprados**
    const totalQuantity = productosCarrito.reduce((total, item) => total + item.cantidad, 0);

    // Verificar si el usuario tiene saldo suficiente para cubrir el precio total
    if (req.user.monto < totalPrice) {
      console.log("Saldo insuficiente para realizar la compra.");
      return res.status(400).json({ error: "Saldo insuficiente para realizar la compra." });
    }

    // Verificar stock suficiente para cada producto
    for (const item of productosCarrito) {
      if (item.cantidad > item.stock) {
        console.log(`Stock insuficiente para el producto: ${item.nombre}`);
        return res.redirect(`/checkout?failed=Producto "${item.nombre}" no tiene suficiente stock`);
      }
    }

    // Si el saldo y el stock son suficientes, proceder con la compra
    // Actualizar el saldo en la wallet
    const updateWalletQuery = `UPDATE wallet SET monto = monto - $1 WHERE user_id = $2 RETURNING monto`;
    const newMontoResult = await sql(updateWalletQuery, [totalPrice, userId]);
    const newMonto = newMontoResult[0].monto;

    // Actualizar el token con el nuevo monto
    const updatedToken = jwt.sign(
      { id: req.user.id, name: req.user.name, role: req.user.role, monto: newMonto, exp: req.user.exp },
      CLAVE_SECRETA
    );
    res.cookie(AUTH_COOKIE_NAME, updatedToken, { maxAge: 60 * 5 * 1000 });

    // Actualizar stock en la tabla productos
    for (const item of productosCarrito) {
      const updateStockQuery = `UPDATE productos SET stock = stock - $1 WHERE id = $2`;
      await sql(updateStockQuery, [item.cantidad, item.id]);
    }

    // Vaciar el carrito si se ha pagado completamente
    const emptyCartQuery = `DELETE FROM carrito_productos WHERE carrito_id = $1`;
    await sql(emptyCartQuery, [carritoId]);

    // **Insertar un recibo en la base de datos con la cantidad total**
    const insertarReciboQuery = `
      INSERT INTO recibos (usuario_id, fecha, monto, cantidad)
      VALUES ($1, CURRENT_DATE, $2, $3)
    `;
    await sql(insertarReciboQuery, [userId, totalPrice, totalQuantity]);

    console.log("Productos en el carrito:", productosCarrito);
    console.log("Total de productos:", totalQuantity);
    console.log("Total a pagar:", totalPrice);
    
    console.log("Compra realizada con éxito. Carrito vacío.");
    return res.redirect('/checkout?success=COMPRA REALIZADA');
  } catch (error) {
    console.error("Error al procesar el pago:", error);
    res.status(500).send("Error al procesar el pago");
  }
});

// Lista de recibos
app.get('/recibos', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // Consulta para obtener cada recibo junto con una imagen de un producto
    const recibosQuery = `
      SELECT r.id, r.fecha, r.monto, r.cantidad, 
             (SELECT p.imagen_url 
              FROM carrito_productos cp 
              JOIN productos p ON cp.producto_id = p.id 
              WHERE cp.carrito_id = r.id 
              LIMIT 1) AS imagen_url
      FROM recibos r
      WHERE r.usuario_id = $1
      ORDER BY r.fecha DESC
    `;
    const recibos = await sql(recibosQuery, [userId]);

    console.log(recibos); // Verificar el resultado de la consulta

    // Renderizar la vista de recibos con los datos obtenidos, incluyendo una sola imagen_url de un producto
    res.render('recibos', { name: req.user.name, monto: req.user.monto, recibos });
  } catch (error) {
    console.error("Error al cargar los recibos:", error);
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
  res.render('/checkout');
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