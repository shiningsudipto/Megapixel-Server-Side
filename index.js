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
        // await client.connect();

        const classCollection = client.db('megapixel').collection('classes');
        const selectedClassCollection = client.db('megapixel').collection('selectedClasses');
        const userCollection = client.db('megapixel').collection('users');
        const enrolledClassCollection = client.db('megapixel').collection('enrolledClass');

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '1h'
            })
            res.send({ token });
        })
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            if (user?.role !== 'Admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' })
            }
            next()
        }
        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await userCollection.findOne(query);
            if (user?.role !== 'Instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' })
            }
            next()
        }
        // Identifying admin or not
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            // console.log(email);
            // console.log(req.decoded.email)
            if (req.decoded.email !== email) {
                return res.json({ admin: false })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query);
            // console.log(user);
            const result = { admin: user?.role === 'Admin' }
            res.json(result)
        })
        // Identifying instructor or not
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            // console.log(email);
            // console.log(req.decoded.email);
            if (req.decoded.email !== email) {
                return res.json({ instructor: false })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query);
            // console.log(user);
            const result = { instructor: user?.role === 'Instructor' }
            res.json(result)
        })
        app.get('/users/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) {
                return res.json({ student: false })
            }
            const query = { email: email }
            const user = await userCollection.findOne(query);
            const result = { student: user?.role === 'student' }
            res.json(result)
        })

        // all classes
        app.get('/manageClasses', verifyJWT, verifyAdmin, async (req, res) => {
            const classes = await classCollection.find().toArray();
            res.json(classes);
        });
        // all classes with status 'Approved'
        app.get('/classes', async (req, res) => {
            const classes = await classCollection.find({ status: "Approved" }).sort({ availableSeats: 1 }).toArray();
            res.json(classes);
        });
        // Making class status pending to approved and Deny
        app.put('/classes/approve/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateStatus = req.body;
            const update = {
                $set: {
                    status: updateStatus.newStatus
                }
            }
            if (updateStatus.newStatus === 'Approved') {
                update.$unset = {
                    feedback: 1
                };
            }
            const result = await classCollection.updateOne(query, update);
            res.json(result)
        })
        // setting feedback to the class
        app.patch('/classes/feedback/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) };
            const feedback = req.body.feedback; // Retrieve the feedback value from the request body
            const update = { $set: { feedback: feedback } }
            const updatedClass = await classCollection.findOneAndUpdate(query, update);
            res.json(updatedClass);
        });
        // storing selected classes
        app.post('/selectedClass', verifyJWT, async (req, res) => {
            const item = req.body;
            const result = await selectedClassCollection.insertOne(item);
            res.json(result)
        })
        // all instructors
        app.get('/instructors', async (req, res) => {
            const result = await userCollection.find({ role: 'Instructor' }).toArray();
            res.json(result);
        });
        // storing new user's information
        app.post('/newUser', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.json({ message: 'user already exists' })
            }
            const result = await userCollection.insertOne(user);
            res.json(result);
        });
        // getting selected class by specific email
        app.get('/myclass/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const result = await selectedClassCollection.find({ studentEmail: email }).toArray();
            res.json(result);
        });
        // delete selected class
        app.delete('/deleteSelectedClass/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.deleteOne(query);
            res.json(result);
        })
        // getting selected class by id
        app.get('/findSelectedClass/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            const result = await selectedClassCollection.findOne(query);
            res.json(result);
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
            res.json({
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

            res.json({ insertResult, deleteResult });
        });
        // updating available seats
        app.put('/updateavailableseats/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const query = { _id: new ObjectId(id) }
            // console.log(query);
            const classDocument = await classCollection.findOne(query);
            if (!classDocument) {
                // Handle the case when the document is not found
                return res.status(404).send({ error: "Class not found" });
            }
            const updateSeats = parseInt(classDocument.availableSeats) - 1;
            // console.log(classDocument.availableSeats);
            const updateQuery = {
                $set: {
                    availableSeats: updateSeats
                }
            }
            const updateResult = await classCollection.updateOne(query, updateQuery)
            res.json(updateResult)
        })
        // getting all enrolled class by email
        app.get('/myEnrolledClass/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const result = await enrolledClassCollection.find({ studentEmail: email }).toArray();
            res.json(result);
        });
        // storing class added by the instructor
        app.post('/instructorAddedClasses', verifyJWT, async (req, res) => {
            const query = req.body;
            const result = await classCollection.insertOne(query);
            res.json(result)
        })
        // getting added classes by instructor with email
        app.get('/instructorsAddedClass/:email', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.params.email;
            try {
                const classes = await classCollection.find({ instructorEmail: email }).toArray();
                res.json(classes);
            } catch (error) {
                res.status(500).send('An unexpected error occurred.');
            }
        });
        // getting all registered user
        app.get('/allRegisteredUsers', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.json(result)
        })
        // getting user by email for identify role
        app.get('/userRole/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            // console.log(email);
            const query = { email: email }
            const result = await userCollection.findOne(query);
            res.json(result);
        })
        // updating user role
        app.put('/users/role/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateRole = req.body.newRole;
            const update = {
                $set: {
                    role: updateRole
                }
            };
            const result = await userCollection.updateOne(query, update);
            res.json(result);
        });

        app.get('/enrolledClass/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { instructorEmail: email }
            const result = await enrolledClassCollection.find(query).toArray();
            res.json(result)
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