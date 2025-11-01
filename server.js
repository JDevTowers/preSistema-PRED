// server.js - CORREGIDO: FOTOS + TOTAL FÍSICO + UBICACIONES FIJAS
import express from 'express';
import sql from 'mssql';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());

// SERVIR FOTOS DESDE CARPETA 'fotos/'
app.use('/fotos', express.static(path.join(__dirname, 'fotos')));
app.use(express.static(__dirname));

// Configuración de SQL Server
const config = {
    server: 'localhost',
    port: 61720,
    database: 'basepred',
    user: 'usr_prueba',
    password: 'pwd_prueba',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    }
};

// Endpoint de prueba
app.get('/api/test', (req, res) => {
    res.json({ 
        mensaje: 'Servidor funcionando',
        timestamp: new Date().toISOString()
    });
});

// LOGIN
app.post('/api/login', async (req, res) => {
    const { usuario, password } = req.body;
    
    try {
        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('usuario', sql.VarChar, usuario)
            .input('password', sql.VarChar, password)
            .query(`
                SELECT e.*, p.clave
                FROM empleado e
                INNER JOIN permisos p ON e.idusuario = p.idusuario
                WHERE (e.idusuario = TRY_CAST(@usuario AS INT) OR e.nombre LIKE '%' + @usuario + '%')
                AND p.clave = @password AND e.activo = 1
            `);
        
        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            res.json({ success: true, usuario: user.idusuario, nombre: user.nombre, rol: user.areastrab });
        } else {
            res.json({ success: false, mensaje: 'Usuario o contraseña incorrectos' });
        }
        await pool.close();
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, mensaje: error.message });
    }
});

// GET - Documentos
app.get('/api/documentos', async (req, res) => {
    try {
        const pool = await sql.connect(config);
        const result = await pool.request().query(`
            SELECT 
                d.fichareg,
                d.titulolibro as titulo,
                d.subtitulo,
                d.tipo,
                d.periodicidad,
                d.fechapublica,
                STRING_AGG(CAST(a.nombre AS NVARCHAR(MAX)), ', ') as autor,
                
                -- TOTAL FÍSICO REAL (sin duplicados)
                ISNULL((
                    SELECT SUM(existencia) 
                    FROM almacen al2 
                    WHERE al2.fichareginv = d.fichareg
                ), 0) as existenciaFisica,
                
                -- FOTOS
                ISNULL(p.fotos, 0) as fotos,

                -- DIGITAL
                MAX(ISNULL(i.digital, 0)) as esDigital,
                MAX(ISNULL(i.cantdigital, 0)) as existenciaDigital,
                
                -- IMPRESO
                CASE 
                    WHEN EXISTS (SELECT 1 FROM impresion i2 WHERE i2.ficharegimp = d.fichareg AND i2.impresa = 1)
                    OR EXISTS (SELECT 1 FROM almacen al3 WHERE al3.fichareginv = d.fichareg AND al3.existencia > 0)
                    THEN 1 ELSE 0 
                END as esImpreso
                
            FROM documento d
            LEFT JOIN paso2 p ON d.fichareg = p.idpaso2
            LEFT JOIN impresion i ON d.fichareg = i.ficharegimp
            LEFT JOIN autorasignado aa ON d.fichareg = aa.ficharega
            LEFT JOIN autor a ON aa.idautorasig = a.idautor
            GROUP BY d.fichareg, d.titulolibro, d.subtitulo, d.tipo, d.periodicidad, d.fechapublica, p.fotos
            ORDER BY d.fechapublica DESC
        `);
        
        res.json({
            success: true,
            total: result.recordset.length,
            data: result.recordset
        });
        await pool.close();
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, mensaje: error.message });
    }
});

// GET - UBICACIONES
app.get('/api/ubicaciones', async (req, res) => {
    const { fichas } = req.query;
    if (!fichas) return res.status(400).json({ success: false, mensaje: 'Faltan parámetros' });
    
    try {
        const pool = await sql.connect(config);
        const fichasArray = fichas.split(',').map(f => f.trim());
        
        const result = await pool.request().query(`
            SELECT 
                d.fichareg,
                d.titulolibro as titulo,
                d.subtitulo,
                al.ubicacion,
                al.existencia,
                ISNULL(p.fotos, 0) as fotos,
                ISNULL(i.impresa, 0) as impresa,
                ISNULL(i.digital, 0) as digital
            FROM documento d
            INNER JOIN almacen al ON d.fichareg = al.fichareginv
            LEFT JOIN impresion i ON d.fichareg = i.ficharegimp
            LEFT JOIN paso2 p ON d.fichareg = p.idpaso2
            WHERE d.fichareg IN ('${fichasArray.join("','")}')
            ORDER BY d.fichareg, al.ubicacion
        `);
        
        res.json({
            success: true,
            total: result.recordset.length,
            data: result.recordset
        });
        await pool.close();
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ success: false, mensaje: error.message });
    }
});

// Iniciar servidor
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor en http://localhost:${PORT}`);
    console.log(`Prueba la foto: http://localhost:${PORT}/fotos/LI-012-23_1.jpg`);
});