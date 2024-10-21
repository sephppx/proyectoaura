import jwt from 'jsonwebtoken';
import { AUTH_COOKIE_NAME, CLAVE_SECRETA } from '../index.js';

export const auth = (req, res, next) => {
    try {
        console.log("Middleware se está usando");

        const token = req.cookies[AUTH_COOKIE_NAME];
        if (!token) {
            console.log("No token found");
            return res.redirect('/login'); 
        }

        const decoded = jwt.verify(token, CLAVE_SECRETA);
        if (decoded) {
            req.user = decoded;
            console.log("Decoded:", req.user);
            return next(); 
        }
    } catch (error) {
        console.error("Error en el middleware de autenticación:", error);
        return res.redirect('/login');
    }
};


export const adminMiddleware = (req, res, next) => {
    if (req.user && req.user.role === 'admin') { 
        return next(); 
    } else {
        console.log("No tienes permisos para acceder a esta ruta");
        return res.send("No tienes permisos para acceder a esta ruta")
    }
};