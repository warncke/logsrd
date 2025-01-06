import Request from "../request"

export default class CreateLogRequest extends Request {
    processStep(step: number) {
        if (!CreateLogRequest.steps[step]) {
            throw new Error(`Invalid step: ${step}`)
        }
        CreateLogRequest.steps[step](this)
    }

    static authorize(request: Request) {
        // TODO
        request.completeStep()
    }

    static steps: Array<null | ((request: Request) => void)> = [null, CreateLogRequest.authorize]
}
