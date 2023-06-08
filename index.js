const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json('Megapixel IS Running')
})

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kh5m3gl.mongodb.net/?retryWrites=true&w=majority`;

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

        const classCollection = client.db('megapixel').collection('classes');
        const selectedClassCollection = client.db('megapixel').collection('selectedClasses');
        const userCollection = client.db('megapixel').collection('users');
        const enrolledClassCollection = client.db('megapixel').collection('enrolledClass');
        const pendingClassesCollection = client.db('megapixel').collection('pendingClasses');

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token });
        })
        // all classes
        app.get('/classes', async (req, res) => {
            const classes = classCollection.find();
            const result = await classes.toArray();
            res.send(result);
        })
        // storing selected classes
        app.post('/selectedClass', async (req, res) => {
            const item = req.body;
            const result = await selectedClassCollection.insertOne(item);
            res.send(result)
        })
        // all instructors
        app.get('/instructors', async (req, res) => {
            const result = await userCollection.find({ role: 'instructor' }).toArray();
            res.send(result);
        });
        // storing new user's information
        app.post('/newUser', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });
        // getting selected class by specific email
        app.get('/myclass/:email', async (req, res) => {
            const email = req.params.email;
            const result = await selectedClassCollection.find({ studentEmail: email }).toArray();
            res.json(result);
        });
        // delete selected class
        app.delete('/deleteSelectedClass/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.deleteOne(query);
            res.send(result);
        })
        // getting selected class by id
        app.get('/findSelectedClass/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.findOne(query);
            res.send(result);
        })
        // payment intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = price * 1000;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        // payment
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await enrolledClassCollection.insertOne(payment);
            const id = payment.classId;
            const query = { _id: new ObjectId(id) }; // Match the classId field
            const deleteResult = await selectedClassCollection.deleteOne(query);

            res.send({ insertResult, deleteResult });
        });
        // updating available seats
        app.put('/updateavailableseats/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id);
            const query = { _id: new ObjectId(id) }
            console.log(query);
            const classDocument = await classCollection.findOne(query);
            if (!classDocument) {
                // Handle the case when the document is not found
                return res.status(404).send({ error: "Class not found" });
            }
            const updateSeats = parseInt(classDocument.availableSeats) - 1;
            console.log(classDocument.availableSeats);
            const updateQuery = {
                $set: {
                    availableSeats: updateSeats
                }
            }
            const updateResult = await classCollection.updateOne(query, updateQuery)
            res.send(updateResult)
        })
        // getting all enrolled class by email
        app.get('/myEnrolledClass/:email', async (req, res) => {
            const email = req.params.email;
            const result = await enrolledClassCollection.find({ studentEmail: email }).toArray();
            res.json(result);
        });
        // storing class added by the instructor
        app.post('/pendingClasses', async (req, res) => {
            const query = req.body;
            const result = await pendingClassesCollection.insertOne(query);
            res.send(result)
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connected with Megapixel!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`server is running on port: ${port}`)
})