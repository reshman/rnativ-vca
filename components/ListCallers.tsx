import { router } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ListCallers = () => {

  const startCall = (mode: 'audio' | 'video') => {
    router.push('/call-connecting');
    
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Image 
            style={styles.cardImage}
            source={{uri: 'https://www.citypng.com/public/uploads/preview/hd-man-user-illustration-icon-transparent-png-701751694974843ybexneueic.png'}}
        />
        <View style={styles.cardDescription}>
            <Text style={styles.cardDescriptionNameText}>Unknown</Text>
        </View>
        
        <View style={styles.btnContainers}>
            <TouchableOpacity style={styles.callBtn} onPress={() => startCall('audio')}>
                <Text style={styles.callBtnTextAudio}>Audio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.callBtn} onPress={() => startCall('video')}>
                <Text style={styles.callBtnTextAudio}>Video</Text>
            </TouchableOpacity>
        </View>
        
      </View>
      
    </View>
  )
}

export default ListCallers

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 200
    },
    card: {
        width: 360,
        height: 320,
        backgroundColor: 'orange',
        alignItems: 'center',
        borderRadius: 10,
        elevation: 5
    },
    cardImage: {
        marginVertical: 10,
        width: '95%',
        height: 200,
        resizeMode: 'cover',
    },
    cardDescription: {
    },
    cardDescriptionNameText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'red'
    },
    btnContainers: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '90%',
        marginTop: 10,
      },
      callBtn: {
        backgroundColor: 'red',
        height: 35,
        width: 80,
        borderRadius: 5,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
        
      },
      callBtnTextAudio: {
        fontWeight: '600',
        color: '#ffffff',
      },
      
})