export class MetroServerError extends Error {
    code = 'METRO_SERVER_ERROR';
    url;
    constructor(errorObject, url){
        super(errorObject.message);
        this.name = 'MetroServerError';
        this.url = url;
        for(const key in errorObject){
            this[key] = errorObject[key];
        }
    }
}

//# sourceMappingURL=errors.js.map
