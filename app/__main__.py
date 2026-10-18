import os

import uvicorn

if __name__ == '__main__':
    uvicorn.run('app.main:app', host=os.environ.get('HOST', '0.0.0.0'), port=int(os.environ.get('PORT', 8000)),
                workers=1, proxy_headers=False, access_log=os.environ.get('ACCESS_LOG') == '1')
