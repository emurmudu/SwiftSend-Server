const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 8000;

//middleware

app.use(cors({
    origin: [
        'http://localhost:5173',
    ],
    credentials: true
}));
app.use(express.json());



const logger = (req, res, next) => {
    console.log('logging info', req.method, req.url);
    next();
}

const verifyingToken = (req, res, next) => {
    const token = req?.cookies?.token;
    console.log('Middleware token', token);
    if (!token) {
        return res.status(401).send({ message: 'unauthorize access' })
    }
    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decode) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorize access' })
        }
        req.user = decode;
        next();
    })

}





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pjucvmj.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const userCollection = client.db('userDB').collection('user');



        //create user on database
        app.post('/user', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await userCollection.insertOne(user);
            res.send(result);
        })

        //read user
        app.get('/user', async (req, res) => {
            const cursor = userCollection.find();
            const users = await cursor.toArray();
            res.send(users);
        })



        //auth related api
        app.post('/jwt', logger, async (req, res) => {
            const user = req.body;
            console.log('user token', user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            // res.send({ token });
            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none'
            })
                .send({ success: true });
        })


        app.post('/logout', async (req, res) => {
            const user = req.body;
            console.log('logging out', user)
            res.clearCookie('token', { maxAge: 0 }).send({ success: true })
        })



        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('Assignment-12-server in running')
})

app.listen(port, () => {
    console.log(`Assignment-12-server is running on port ${port}`)
})