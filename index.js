const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5001;

//middleware

app.use(cors({
    origin: [
        'http://localhost:5173',
    ],
    credentials: true
}));
app.use(cookieParser());
// app.use(cors());
app.use(express.json());




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
        // await client.connect();

        const userCollection = client.db('userDB').collection('user');
        const bookedParcelCollection = client.db('userDB').collection('bookedParcels');


        // auth related api using http cookie
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            console.log('user token', user);
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'none'
            })
            // res.send({ success: true });
            res.send({ token });
        })



        // Middleware to verify the token
        const verifyToken = (req, res, next) => {
            console.log('inside verifyToken', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decode) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decode = decode;
                next();
            })
        }



        const verifyAdmin = async (req, res, next) => {
            const email = req.decode.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }





        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const page = req.query.page || 1;
            const pageSize = 5;

            try {
                const result = await userCollection.find()
                    .skip((page - 1) * pageSize)
                    .limit(pageSize)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        app.get('/user/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decode.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });

        })


        app.get('/user/deliveryMan/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decode.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const user = await userCollection.findOne(query);
            let deliveryMan = false;
            if (user) {
                deliveryMan = user?.role === 'deliveryMan';
            }
            res.send({ deliveryMan });

        })

        // find delivery men
        // app.get('/deliveryMen', verifyToken, verifyAdmin, async (req, res) => {
        app.get('/deliveryMen', async (req, res) => {
            try {
                const result = await userCollection.find({ role: 'deliveryMan' }).toArray();
                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });


        // api for creating user on database
        app.post('/user', async (req, res) => {
            const users = req.body;
            //insert user email if it is not exist in current database
            const query = { email: users.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null });
            }
            console.log(users);
            const result = await userCollection.insertOne(users);
            res.send(result);
        })



        // api for make user as admin
        app.patch('/user/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        // api for make user as deliveryMan
        app.patch('/user/deliveryMan/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'deliveryMan'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })



        //api for adding data to database by all users/Parcel Booking
        app.post('/bookedParcels', async (req, res) => {
            const addedParcel = req.body;
            console.log(addedParcel);
            const result = await bookedParcelCollection.insertOne(addedParcel);
            res.send(result);
        })




        // api for updating status, adding new field
        app.put('/bookedParcels/:id', async (req, res) => {
            const parcelId = req.params.id;
            const { status, deliveryMenId, approximateDeliveryDate } = req.body;


            if (!ObjectId.isValid(parcelId)) {
                return res.status(400).json({ error: 'Invalid Parcel ID' });
            }

            try {

                const result = await bookedParcelCollection.updateOne(
                    { _id: new ObjectId(parcelId) },
                    {
                        $set: {
                            status: status || 'On The Way',
                            deliveryMenId,
                            approximateDeliveryDate,
                        },
                    }
                );

                if (result.modifiedCount > 0) {
                    return res.json({ success: true, message: 'Parcel updated successfully' });
                } else {
                    return res.status(404).json({ error: 'Parcel not found' });
                }
            } catch (error) {
                console.error('Error updating parcel:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
        });




        // api for getting all booked parcel which are added by all user/All Parcels
        app.get('/bookedParcels', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const pageSize = 5;

            try {
                const result = await bookedParcelCollection.find()
                    .skip((page - 1) * pageSize)
                    .limit(pageSize)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });


        // api for getting user based added data/My Parcels
        app.get('/bookedParcels/:email', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const pageSize = 5;

            try {
                const email = req.params.email;

                const result = await bookedParcelCollection.find({ email })
                    .skip((page - 1) * pageSize)
                    .limit(pageSize)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });


        app.delete('/user/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })



        app.post('/logout', async (req, res) => {
            const user = req.body;
            console.log('logged out', user)
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