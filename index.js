/**
nexmo context: 
you can find this as the second parameter of rtcEvent funciton or as part or the request in req.nexmo in every request received by the handler 
you specify in the route function.

it contains the following: 
const {
        generateBEToken,
        generateUserToken,
        logger,
        csClient,
        storageClient
} = nexmo;

- generateBEToken, generateUserToken,// those methods can generate a valid token for application
- csClient: this is just a wrapper on https://github.com/axios/axios who is already authenticated as a nexmo application and 
    is gonna already log any request/response you do on conversation api. 
    Here is the api spec: https://jurgob.github.io/conversation-service-docs/#/openapiuiv3
- logger: this is an integrated logger, basically a bunyan instance
- storageClient: this is a simple key/value inmemory-storage client based on redis

*/



/** 
 * 
 * This function is meant to handle all the asyncronus event you are gonna receive from conversation api 
 * 
 * it has 2 parameters, event and nexmo context
 * @param {object} event - this is a conversation api event. Find the list of the event here: https://jurgob.github.io/conversation-service-docs/#/customv3
 * @param {object} nexmo - see the context section above
 * */

const DATACENTER = `https://api.nexmo.com` 

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const rtcEvent = async (event, { logger, csClient,storageClient }) => {

    try { 
        const type = event.type
        if (type === 'app:knocking') { /* I m receiving a knocker, it means someone is trying to enstiblish a call  */
            const knocking_id = event.from
            
            /* create a conversation */
            const channel = event.body.channel
            const convRes = await csClient({
                url: `${DATACENTER}/v0.3/conversations`,
                method: "post",
                data: {},
            })

            const conversation_id = convRes.data.id
            const user_id = event.body.user.id

            /* join the user created by the knocker in the conversation  aka we join the caller to the conversation we have just created */
            const memberRes = await csClient({
                url: `${DATACENTER}/v0.3/conversations/${conversation_id}/members`,
                method: "post",
                data: {
                    user:    {
                        id: user_id
                    } ,
                    knocking_id: knocking_id,
                    state: "joined",
                    channel: {
                        type: channel.type,
                        id: channel.id,
                        to: channel.to,
                        from: channel.from,
                        "preanswer": false
                    },
                    "media": {
                        "audio": true
                    }

                }
            })

        } else if (type === 'member:media' && (event.body.media && event.body.media.audio === true)) { /* the member as the audio enabled */
            const legId = event.body.channel.id

            /* we send a text to speech action to the conversation */
            await csClient({
                url: `${DATACENTER}/v0.3/legs/${legId}/talk`,
                method: "post",
                data: { "loop": 1, "text": "Hello, now we are gonna record you! ", "level": 0, "voice_name": "Kimberly" },
            })

        } else if (type == 'audio:say:done'){ /* the text to speech is finished */
            /* we hangup the call */
            const legId = event.body.channel.id
            let recordRes = await csClient({
                url: `${DATACENTER}/v0.3/legs/${legId}/recording`,
                method: "post",
                data: {
                    "split": false,
                    "streamed": true,
                    "beep": true,
                    "public": true,
                    "format": "mp3"
                }
            })
            let record_id = recordRes.data.id
            await sleep(2000)
            
            await csClient({
                url: `${DATACENTER}/v0.3/legs/${legId}/recording`,
                method: "delete"
            })

            //audio:record:done
        } else if (type == 'audio:record:done') { /* the text to speech is finished */
            const recordingsString = await storageClient.get('recordings')
            const recordings = recordingsString ? JSON.parse(recordingsString) : []

            recordings.push(event)

            await storageClient.set('recordings', JSON.stringify(recordings))
        }

    } catch (err) {
        
        logger.error("Error on rtcEvent function")
    }
    
}


/**
 * 
 * @param {object} app - this is an express app
 * you can register and handler same way you would do in express. 
 * the only difference is that in every req, you will have a req.nexmo variable containning a nexmo context
 * 
 */
const route =  async (app) => {
    app.get('/recordings', async (req, res) => {

        const {
            logger,
            storageClient
        } = req.nexmo;
        const recordingsString = await storageClient.get('recordings')
        const recordings = recordingsString ? JSON.parse(recordingsString) : []

        logger.info(`Hello Request HTTP `)

        res.json({
            recordings
        })
    })
}



module.exports = {
    rtcEvent,
    route
}