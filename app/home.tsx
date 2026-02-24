import { View, Text } from "react-native";
import { useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";

export default function Home() {
  const [name, setName] = useState<string>("");

  useEffect(() => {
    const loadUser = async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
     

      if (snap.exists()) {
        setName(snap.data().name);
      }
    };

    loadUser();
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold">Welcome 🎉</Text>
      <Text className="mt-2 text-lg">Hello, {name}</Text>
    </View>
  );
}
