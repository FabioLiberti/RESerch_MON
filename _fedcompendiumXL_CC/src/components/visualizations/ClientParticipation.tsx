import React from 'react';
import {
  Box,
  Text,
  useColorModeValue,
  Flex,
  Heading,
  Badge,
} from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

interface ClientParticipationProps {
  totalClients: number;
  activeClients: number;
  roundNumber: number;
  distribution: 'iid' | 'non_iid_label' | 'non_iid_quantity';
}

export const ClientParticipation: React.FC<ClientParticipationProps> = ({
  totalClients,
  activeClients,
  roundNumber,
  distribution,
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  
  // Define colors for client dots
  const activeColor = useColorModeValue('green.500', 'green.300');
  const inactiveColor = useColorModeValue('gray.300', 'gray.600');
  
  // Label for distribution type
  const distributionLabels = {
    'iid': 'IID',
    'non_iid_label': 'Non-IID (Label Skew)',
    'non_iid_quantity': 'Non-IID (Quantity Skew)'
  };
  
  // Create array of clients
  const clients = Array.from({ length: totalClients }, (_, i) => ({
    id: i,
    active: i < activeClients,
    // For non_iid_quantity, the first third have more data
    size: distribution === 'non_iid_quantity' ? 
      (i < totalClients / 3 ? 12 : 8) : 10,
    // For non_iid_label, divide into 3 groups
    group: distribution === 'non_iid_label' ? 
      (i % 3) : 0
  }));
  
  // Calculate participation rate
  const participationRate = (activeClients / totalClients) * 100;
  
  return (
    <Box
      p={4}
      borderRadius="lg"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Flex justify="space-between" align="center" mb={4}>
        <Heading size="sm" color={textColor}>
          Client Participation
        </Heading>
        <Badge colorScheme="blue">
          Round {roundNumber}
        </Badge>
      </Flex>
      
      <Text fontSize="sm" mb={3} color={textColor}>
        {activeClients} of {totalClients} clients active ({participationRate.toFixed(0)}%)
      </Text>
      
      <Badge mb={4} colorScheme={
        distribution === 'iid' ? 'green' : 
        distribution === 'non_iid_label' ? 'purple' : 
        'orange'
      }>
        {distributionLabels[distribution]}
      </Badge>
      
      <Flex flexWrap="wrap" mt={2}>
        {clients.map((client) => (
          <MotionBox
            key={client.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ 
              scale: 1, 
              opacity: 1,
              transition: { delay: client.id * 0.02 }
            }}
            whileHover={{ scale: 1.2, transition: { duration: 0.2 } }}
          >
            <Box
              width={client.size}
              height={client.size}
              borderRadius="full"
              bg={client.active ? activeColor : inactiveColor}
              m={1}
              boxShadow={client.active ? `0 0 4px ${client.active ? activeColor : "transparent"}` : "none"}
              border="2px solid"
              borderColor={
                distribution === 'non_iid_label' && client.active ? 
                  (client.group === 0 ? 'blue.400' : 
                   client.group === 1 ? 'purple.400' : 
                   'orange.400') : 
                  'transparent'
              }
            />
          </MotionBox>
        ))}
      </Flex>
    </Box>
  );
};

export default ClientParticipation;