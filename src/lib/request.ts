/**
 * The request object provides the central resource for managing all resources and processing
 * related to each request.
 *
 * After doing an impementation with async/await my opinion is that manually managing async
 * behavior with callback functions may be uglier but for a production server where observability
 * of every single request and resource is desired it may work out better.
 *
 * The async/await paradigm is already not particularly well suited for IO requests which must
 * be queued. I still need to add the complexity of the replication layer, which is another set
 * of queued IO operations, and I would also like to support streaming for large requests, so
 * creating a proper request object model now seems like a good idea.
 *
 * Of course I may get done with this and realize it is just ugly and didn't solve any of my
 * problems, but hope springs enternal.
 *
 * Request Types
 *
 * Create
 * Append
 * Read (Head, Entries, Range)
 * Delete
 * Get Config
 * Set Config
 *
 * Create and Append are both POST requests with a buffer payload that may be JSON.
 * The POST body will be read and buffered for small requests. For large requests the POST
 * data will be replicated as a binary blob first and then only the data id will be added
 * to the log.
 *
 * Replicating data as a blob first has the benefit of limiting the total amount of memory
 * used for buffering a request and decreasing the time the data is buffered for.
 *
 * One behavioral difference is that if data was streamed directly from the client to the
 * log this would allow a single client to effectively lock the log while their upload is
 * in progress. Doing blob replication first means that many clients can be simultaneously
 * doing long slow uploads.
 *
 * For request ordering to be consistent requests must be processed in order from the point
 * of completing the read of the POST body.
 *
 * Request Processing Steps
 *
 *  - Request created
 *    - From either HTTP or WS
 *  - What data is included in request?
 *     - Request Type
 *     - Authentication information (Bearer Token in HTTP)
 *     - logId for requests in log context
 *     - include raw req/res objects? maybe only res because parts of req get deallocated
 *     - specific query params, path params, of headers for particular request
 *  - Is request in a log context? (does it have a logId?)
 *    - For requests on a specific log then first async step is to load config
 *      - If config is not found this is error
 *  - If request is Append on replicated log then replication must complete successfully
 *    before appending to master.
 *    - Replication requests(s) should also support async replication that does not block
 *      request completion for the use case where a sync replica group in a low-latency
 *      cluster is best effort replicated to a more remote server for backup purposes.
 *  - All IO (disk or network) needs to be queued and processed in order
 *    - Two main log IO operations: Append and Read
 *    - Either can issue multiple IO operations
 *    - IO operations may be across multiple logs and/or hosts
 *      - Does it ever make sense for master to send READ to replica?
 *        - In theory this could balance disk IO between master and replica(s) but disk IO
 *          can already be balanced at the system level by how logs are assigned to master
 *          and replica nodes. Assume the file IO is not the bottleneck? Just optimize it?
 *  - For read IO operations we may want to begin streaming response once a certain amount
 *    of data is read
 *  - Read IO operations may need additional read IO operations to complete if record is
 *    stored as a blob. Can these be executed as part of the original operation?
 *
 * IO Queues
 *
 * Global Log | Log Log | Hosts
 *
 * For every request we need to track it from the point that it is created until it is
 * completed, either successfully or with error.
 *
 * During the processing of the request we need to track every asynchronous IO operation
 * that is performed. IO operations are created, then added to a queue for the resource
 * they are being performed on, but they can also be moved between queues.
 *
 * We need to keep track of every IO request and what queue it is assigned to until the
 * request is complete.
 *
 * For any instant we should have a snapshot of the total server state:
 *   - All in progress requests
 *     - Their current state
 *     - What IO operation(s) if any they are waiting on
 *     - What queues those IO operations are assigned to
 *   - All open logs, current queue status
 *   - All connected hosts, current queue status
 *
 * For websocket connections to clients do we need another queue per connection?
 *   - This is expensive, we could just disconnect on too much backpressure
 *   - Data has to be cached somewhere. In application 1 record may be sent to many
 *     clients, so it is cheaper to cache once in application then dump it into TCP
 *     buffers where it is cached once per client
 *
 * Client WebSocket Patterns (not implemented)
 *   - Watch Log
 *     - Client is sent every new log entry as it is appended
 *     - After append request is completed it needs to kick off notifications for any watcher(s)
 *
 * Two Dimensions: Request Type and Request Transport (HTTP, WS)
 *   - Request type determines the processing steps needed to complete the request
 *   - Request transports determines how request is read from client and response is sent
 *
 * Don't use class inheritence?
 *   - instanceof checking is lame anyway
 *   - easier to port to other languages if not dependent on class implementation
 *
 * How to handle common functionality:
 *   - Append and Set Config are mostly the same on persistence but have different authentication
 *   - Read HEAD|CONFIG|Records all do read IO on log but read different records, may have different auth
 *   - Create log has additional setup but is then basically append
 *   - Delete log is mostly unique
 *   - Everything in log context needs to fetch log config first or return error if not found
 */
import IOOperation from "./persist/io/io-operation"
import HttpPostRequest from "./request/http-post-request"
import WsRequest from "./request/ws-request"
import Server from "./server"

let requestNum = 0

export default class Request {
    server: Server
    request: HttpPostRequest | WsRequest
    error: any
    start: number | null
    finish: number | null
    stepStarted: number = 0
    stepCompleted: number = 0
    ops: IOOperation[] = []
    opsComplete: number = 0
    requestNum: number

    constructor(server: Server, request: HttpPostRequest | WsRequest) {
        this.server = server
        this.request = request
        this.start = null
        this.finish = null
        this.error = null
        this.requestNum = requestNum++
    }

    process() {
        this.start = Date.now()
        this.request.init((err) => (err ? this.completeWithError(err) : this.processNextStep()))
    }

    completeStep() {
        this.stepCompleted++
        this.processNextStep()
    }

    processNextStep() {
        if (this.stepStarted > this.stepCompleted) {
            // TODO: add handling
            return
        }
        this.processStep(++this.stepStarted)
    }

    processStep(step: number) {
        throw new Error("Not implemented")
    }

    complete() {
        this.finish = Date.now()
    }

    completeWithError(err: any) {
        this.error = err
        this.finish = Date.now()
    }
}
