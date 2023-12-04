const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');



// const mongoose = require('mongoose');
const bodyParser = require('body-parser');

const app = express();
const port = process.env.PORT || 5001;

// Set up multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

//middleware

// app.use(cors({
//     origin: [
//         // 'http://localhost:5173',
//         'https://assignment-12-client-f25b1.web.app',
//         'https://assignment-12-client-f25b1.firebaseapp.com'
//     ],
//     credentials: true
// }));
// app.use(cors());

const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://assignment-12-client-f25b1.web.app',
        'https://assignment-12-client-f25b1.firebaseapp.com'
    ],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.options('*', cors());


app.use(cookieParser());
app.use(bodyParser.json());
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
        const actionsCollection = client.db('userDB').collection('actions');
        app.use(bodyParser.json());



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





        // app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
        app.get('/users', async (req, res) => {
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



        //////////////////////////////
        //API endpoint to get user data
        app.put('/updateProfilePicture/:id', async (req, res) => {
            try {
                const userId = req.params.id;
                const filter = { _id: new ObjectId(userId) };
                const update = {
                    $set: {
                        profilePicture: req.body.profilePicture,
                    },
                };

                const result = await userCollection.updateOne(filter, update);
                res.json({ success: true, result });
            } catch (error) {
                console.error('Error updating profile picture:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        });

        // app.put('/users', async (req, res) => {
        //     const id = req.params.id;
        //     const filter = { _id: new ObjectId(id) };
        //     const options = { upsert: true };
        //     updatePhoto = req.body;
        //     const photoURL = {
        //         $set: {
        //             image: updatePhoto.photoURL
        //         }
        //     }
        //     const result = await bookedParcelCollection.updateOne(filter, photoURL, options);
        //     res.send(result);
        // })

        /////////////////////////////



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

                console.log('Delivery Men ID:', deliveryMenId);
                console.log('Approximate Delivery Date:', approximateDeliveryDate);
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


        //////////////////Cancel Status Button 
        app.put('/statusCancel/:id', async (req, res) => {
            const parcelId = req.params.id;

            if (!ObjectId.isValid(parcelId)) {
                return res.status(400).json({ error: 'Invalid Parcel ID' });
            }

            try {
                const existingParcel = await bookedParcelCollection.findOne({ _id: new ObjectId(parcelId) });

                if (!existingParcel) {
                    return res.status(404).json({ error: 'Parcel not found' });
                }

                if (existingParcel.status !== 'pending') {
                    return res.status(400).json({ error: 'You can only cancel bookings with "pending" status.' });
                }

                // Show alert before updating the status to 'cancel'
                const userConfirmed = req.body.userConfirmed === true;
                if (!userConfirmed) {
                    return res.json({ message: 'Please confirm the cancellation by setting userConfirmed to true.' });
                }

                const result = await bookedParcelCollection.updateOne(
                    { _id: new ObjectId(parcelId), status: 'pending' }, // Add status check to avoid unnecessary updates
                    {
                        $set: {
                            status: 'Canceled',
                        },
                    }
                );

                if (result.modifiedCount > 0) {
                    return res.json({ success: true, message: 'Parcel canceled successfully' });
                } else {
                    return res.status(404).json({ error: 'Parcel not found or already canceled' });
                }
            } catch (error) {
                console.error('Error updating parcel:', error);
                return res.status(500).json({ error: 'Internal Server Error' });
            }
        });


        //Delivered button status
        /////////////////////          


        app.get('/updateBooking/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bookedParcelCollection.findOne(query);
            res.send(result);
        })





        // Updating bookings with id
        app.put('/updateBooking/:id', async (req, res) => {
            const id = req.params.id;
            console.log('what is id:', id);
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateBooking = req.body;
            const booking = {
                $set: {
                    name: updateBooking.name,
                    users_phone: updateBooking.users_phone,
                    parcel_type: updateBooking.parcel_type,
                    email: updateBooking.email,
                    parcel_weight: updateBooking.parcel_weight,
                    receiver_name: updateBooking.receiver_name,
                    receiver_phone: updateBooking.receiver_phone,
                    delivery_address: updateBooking.short_description,
                    requested_delivery_date: updateBooking.requested_delivery_date,
                    latitude: updateBooking.latitude,
                    longitude: updateBooking.longitude,
                    price: updateBooking.price,
                    status: updateBooking.status,
                    approximateDeliveryDate: updateBooking.approximateDeliveryDate,
                    deliveryMenId: updateBooking.deliveryMenId

                }
            }
            const result = await bookedParcelCollection.updateOne(filter, booking, options);
            res.send(result);
        })




        app.get('/bookedParcels', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const pageSize = 5;
            const startDate = req.query.startDate ? parseDate(req.query.startDate) : null;
            const endDate = req.query.endDate ? parseDate(req.query.endDate) : null;

            const query = {};


            if (startDate && endDate) {
                query.requested_delivery_date = {
                    $gte: startDate,
                    $lte: endDate,
                };
            }

            try {
                const result = await bookedParcelCollection
                    .find(query)
                    .skip((page - 1) * pageSize)
                    .limit(pageSize)
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });


        function parseDate(dateString) {
            const [day, month, year] = dateString.split('/');
            return new Date(year, month - 1, day);
        }


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

        // app.delete('/bookedParcels/:id', async (req, res) => {
        //     const id = req.params.id;
        //     const query = { _id: new ObjectId(id) };
        //     const result = await bookedParcelCollection.deleteOne(query);
        //     res.send(result);
        // })



        app.delete('/user/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })






        // app.get('/deliveries/:email', async (req, res) => {
        //     const page = parseInt(req.query.page) || 1;
        //     const pageSize = 5;

        //     try {
        //         const email = req.params.email;

        //         const result = await bookedParcelCollection.find({ email })
        //             .skip((page - 1) * pageSize)
        //             .limit(pageSize)
        //             .toArray();

        //         res.send(result);
        //     } catch (error) {
        //         console.error(error);
        //         res.status(500).json({ error: 'Internal Server Error' });
        //     }
        // });






        app.get('/deliveries/:deliveryMenId', async (req, res) => {
            try {
                const deliveryMenId = req.user.email; // Assuming you have the user object in the request

                const parcels = await bookedParcelCollection.find({ deliveryMenId });
                res.json(parcels);
            } catch (error) {
                console.error(error);
                res.status(500).json({ message: 'Internal Server Error' });
            }
        });




        ////////////////////////////
        app.get('/api/bookedParcels', async (req, res) => {
            try {
                const deliveryMenId = req.query.deliveryMenId;
                console.log('what is it', deliveryMenId);

                const database = client.db('userDB'); // Replace 'your_database' with your actual database name

                const userCollection = client.db('userDB').collection('user');
                const bookedParcelCollection = client.db('userDB').collection('bookedParcels');
                const bookedParcels = await database.collection('bookedParcels').aggregate([
                    {
                        $lookup: {
                            from: "user",
                            let: { deliveryMenId: "$deliveryMenId" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: { $eq: ["$_id", "$$deliveryMenId"] }
                                    }
                                },
                                {
                                    $project: {
                                        _id: 1,
                                        name: 0,
                                        // email: 1,
                                        // requested_delivery_date: 1,
                                        // Add more fields from user as needed
                                    }
                                }
                            ],
                            as: "deliveryManDetails"
                        }
                    },
                    {
                        $unwind: { path: "$deliveryManDetails", preserveNullAndEmptyArrays: true }
                    },
                    {
                        $project: {
                            _id: 1,
                            name: 1,
                            receiver_name: 1,
                            users_phone: 1,
                            requested_delivery_date: 1,
                            approximateDeliveryDate: 1,
                            receiver_phone: 1,
                            delivery_address: 1,
                        }
                    }
                ]).toArray();

                res.json(bookedParcels);
            } catch (error) {
                console.error('Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });
        ////////////////////////////
        /////////////////////////////////////
        // app.get('/api/bookedParcels', async (req, res) => {
        //     try {
        //         const deliveryMenId = req.query.deliveryMenId;
        //         console.log('information', deliveryMenId);

        //         const database = client.db('yourDBName'); // Replace 'yourDBName' with your actual database name
        //         const bookedParcelCollection = database.collection('bookedParcels');
        //         const usersCollection = database.collection('users');

        //         const bookedParcels = await bookedParcelCollection.aggregate([
        //             {
        //                 $match: {
        //                     deliveryMenId: deliveryMenId
        //                 }
        //             },
        //             {
        //                 $lookup: {
        //                     from: "users",
        //                     localField: "deliveryMenId",
        //                     foreignField: "_id",
        //                     as: "deliveryManDetails"
        //                 }
        //             },
        //             {
        //                 $unwind: "$deliveryManDetails"
        //             },
        //             {
        //                 $project: {
        //                     _id: 1,
        //                     name: "$deliveryManDetails.name",
        //                     receiver_name: 1,
        //                     users_phone: 1,
        //                     requested_delivery_date: 1,
        //                     approximateDeliveryDate: 1,
        //                     receiver_phone: 1,
        //                     delivery_address: 1,
        //                 }
        //             }
        //         ]).toArray();

        //         res.json(bookedParcels);
        //     } catch (error) {
        //         console.error('Error:', error);
        //         res.status(500).json({ error: 'Internal Server Error' });
        //     }
        // });

        ////////////////////////////////////////////








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