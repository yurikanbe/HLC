from ecdsa import SigningKey, BadSignatureError,SECP256k1

secret_key = SigningKey.generate(curve=SECP256k1)
print("秘密鍵："+ secret_key.to_string().hex())
public_key = secret_key.verifying_key
print("公開鍵："+public_key.to_string().hex())

doc = "これは送信したい文字です"
signature = secret_key.sign(doc.encode('UTF-8'))
doc="これは送信したい文字です"
print("署名："+signature.hex()) 

try:
    public_key.verify(signature,doc.encode('UTF-8'))
    print("署名は正しいです"+doc)
except BadSignatureError:
    print("署名は正しくありません"+doc)