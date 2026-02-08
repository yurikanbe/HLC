import pandas as pd
from ecdsa import VerifyingKey, SECP256k1
import binascii
import json

transaction=pd.read_pickle("signed_transaction.pkl")
public_key_A_str=transaction["sender"]



