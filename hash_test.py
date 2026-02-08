import hashlib

indata= "こんにちは"
# hash10 = hashlib.sha256(indata.encode('utf-8'))
# print(hash10)
hash = hashlib.sha256(indata.encode('utf-8')).hexdigest()
print(hash)
indata= "こんちは"
hash = hashlib.sha256(indata.encode('utf-8')).hexdigest()
print(hash)







