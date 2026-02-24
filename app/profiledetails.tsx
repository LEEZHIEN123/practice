import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Image, TextInput } from "react-native";
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { auth, db } from "../firebaseConfig";
import { doc, updateDoc, getDoc } from "firebase/firestore";

export default function ProfileDetails() {
    const router = useRouter();

    const [fullName, setFullName] = useState("");

    const [gender, setGender] = useState<"male" | "female">("male");
    const [age, setAge] = useState(28);
    const [height, setHeight] = useState(175.0);
    const [weight, setWeight] = useState(72.0);

    const [ageText, setAgeText] = useState("28");
    const [heightText, setHeightText] = useState("175.0");
    const [weightText, setWeightText] = useState("72.0");

    const clamp = (val: number, min: number, max: number) =>
        Math.min(Math.max(val, min), max);

    const sanitizeDecimal = (t: string) =>
        t.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

    // ✅ Fetch user name
    useEffect(() => {
        const fetchUser = async () => {
            const user = auth.currentUser;
            if (!user) return;

            const snap = await getDoc(doc(db, "users", user.uid));
            if (snap.exists()) {
                setFullName(snap.data().name || "");
            }
        };

        fetchUser();
    }, []);

    const saveProfile = async () => {
        const user = auth.currentUser;
        if (!user) return;

        await updateDoc(doc(db, "users", user.uid), {
            gender,
            age,
            height,
            weight,
            profileCompleted: true,
        });

        router.push("/activitylevel");
    };

    return (
        <View className="flex-1 bg-[#eef2f1] px-6 pt-12">
            {/* Header */}
            <View className="relative mb-6">
                <Text className="text-center text-2xl font-bold text-gray-900 mt-3">
                    Profile Details
                </Text>

                <View className="flex-row justify-center items-center mt-3">
                    <View className="w-10 h-2 rounded-full bg-green-500 mx-1" />
                    <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />
                    <View className="w-2 h-2 rounded-full bg-green-300 mx-1" />

                </View>
            </View>

            {/* ✅ Greeting */}
            <Text className="text-center text-3xl font-extrabold text-gray-900 mt-0">
                Hello {fullName ? fullName : "👋"} !
            </Text>

            <Text className="text-center text-3xl font-bold text-gray-900 mt-2">
                Tell Us About Yourself
            </Text>

            <Text className="text-center text-gray-500 mt-3 mb-1 text-base">
                This helps us personalize your fitness journey{"\n"}and track progress
                accurately.
            </Text>

            {/* Gender Image */}
            <View className="items-center mb-1">
                <Image
                    source={
                        gender === "male"
                            ? require("../assets/images/malefitnesspic.avif")
                            : require("../assets/images/femalefitnesspic.avif")
                    }
                    className="w-48 h-60"
                    resizeMode="contain"
                />
            </View>

            {/* Gender Buttons */}
            <View className="flex-row justify-center gap-6 mb-6">
                <Pressable
                    onPress={() => setGender("male")}
                    className={`w-16 h-16 rounded-full items-center justify-center ${gender === "male" ? "bg-[#76C893]" : "bg-white"
                        }`}
                >
                    <Ionicons
                        name="male"
                        size={24}
                        color={gender === "male" ? "white" : "#76C893"}
                    />
                </Pressable>

                <Pressable
                    onPress={() => setGender("female")}
                    className={`w-16 h-16 rounded-full items-center justify-center ${gender === "female" ? "bg-[#76C893]" : "bg-white"
                        }`}
                >
                    <Ionicons
                        name="female"
                        size={24}
                        color={gender === "female" ? "white" : "#76C893"}
                    />
                </Pressable>
            </View>

            {/* AGE */}
            <View className="mb-6">
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-gray-600 font-semibold ml-3.5">AGE</Text>

                    <View className="flex-row items-center">
                        <TextInput
                            value={ageText}
                            onChangeText={(t) => setAgeText(t.replace(/[^0-9]/g, ""))}
                            onBlur={() => {
                                const n = clamp(parseInt(ageText || "0", 10), 5, 90);
                                setAge(n);
                                setAgeText(String(n));
                            }}
                            keyboardType="numeric"
                            className="w-16 bg-white rounded-lg px-3 py-2 text-center text-gray-800"
                        />
                        <Text className="ml-2 text-gray-500 mr-3.5">years</Text>
                    </View>
                </View>

                <Slider
                    style={{ width: "100%" }}
                    minimumValue={5}
                    maximumValue={90}
                    step={1}
                    value={age}
                    onValueChange={(v) => {
                        setAge(v);
                        setAgeText(String(v));
                    }}
                    minimumTrackTintColor="#76C893"
                    maximumTrackTintColor="#0c3a23"
                    thumbTintColor="#76C893"
                />
            </View>

            {/* HEIGHT (decimal) */}
            <View className="mb-6">
                <View className="flex-row justify-between items-center mb-2 ml-3.5">
                    <Text className="text-gray-600 font-semibold">HEIGHT</Text>

                    <View className="flex-row items-center">
                        <TextInput
                            value={heightText}
                            onChangeText={(t) => setHeightText(sanitizeDecimal(t))}
                            onBlur={() => {
                                const n = clamp(parseFloat(heightText || "0"), 50, 250);
                                const fixed = Number.isFinite(n) ? n : 50;
                                setHeight(fixed);
                                setHeightText(fixed.toFixed(1));
                            }}
                            keyboardType="decimal-pad"
                            className="w-20 bg-white rounded-lg px-3 py-2 text-center text-gray-800"
                        />
                        <Text className="ml-2 text-gray-500 mr-3.5">cm</Text>
                    </View>
                </View>

                <Slider
                    style={{ width: "100%" }}
                    minimumValue={50}
                    maximumValue={250}
                    step={0.1}
                    value={height}
                    onValueChange={(v) => {
                        setHeight(v);
                        setHeightText(v.toFixed(1));
                    }}
                    minimumTrackTintColor="#76C893"
                    maximumTrackTintColor="#0c3a23"
                    thumbTintColor="#76C893"
                />
            </View>

            {/* WEIGHT (decimal) */}
            <View className="mb-6">
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-gray-600 font-semibold ml-3.5">WEIGHT</Text>

                    <View className="flex-row items-center">
                        <TextInput
                            value={weightText}
                            onChangeText={(t) => setWeightText(sanitizeDecimal(t))}
                            onBlur={() => {
                                const n = clamp(parseFloat(weightText || "0"), 25, 250);
                                const fixed = Number.isFinite(n) ? n : 25;
                                setWeight(fixed);
                                setWeightText(fixed.toFixed(1));
                            }}
                            keyboardType="decimal-pad"
                            className="w-20 bg-white rounded-lg px-3 py-2 text-center text-gray-800"
                        />
                        <Text className="ml-2 text-gray-500 mr-3.5">kg</Text>
                    </View>
                </View>

                <Slider
                    style={{ width: "100%" }}
                    minimumValue={25}
                    maximumValue={250}
                    step={0.1}
                    value={weight}
                    onValueChange={(v) => {
                        setWeight(v);
                        setWeightText(v.toFixed(1));
                    }}
                    minimumTrackTintColor="#76C893"
                    maximumTrackTintColor="#0c3a23"
                    thumbTintColor="#76C893"
                />
            </View>

            {/* Continue */}
            <Pressable onPress={saveProfile} className="mt-1 rounded-2xl overflow-hidden">
                <LinearGradient
                    colors={["#76C893", "#52B69A"]}
                    className="py-4 items-center rounded-2xl"
                >
                    <View className="flex-row items-center">
                        <Text className="text-white text-lg font-semibold mr-2">
                            Continue
                        </Text>
                        <Ionicons name="arrow-forward" size={20} color="white" />
                    </View>
                </LinearGradient>
            </Pressable>
        </View>
    );
}