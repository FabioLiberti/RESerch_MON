import React from 'react';
import {
  Box,
  Text,
  useColorModeValue,
  Flex,
  Heading,
  Tooltip,
  Badge
} from '@chakra-ui/react';
import { FiShield, FiInfo } from 'react-icons/fi';
import { IconBox } from './utils/IconUtils';

interface PrivacyMeterProps {
  epsilon?: number;
  privacyMechanism: 'differential_privacy' | 'secure_aggregation' | null;
  sensitivityLevel?: 'low' | 'medium' | 'high';
}

export const PrivacyMeter: React.FC<PrivacyMeterProps> = ({
  epsilon,
  privacyMechanism,
  sensitivityLevel = 'medium',
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'white');
  
  // Define colors for privacy levels
  const highPrivacyColor = useColorModeValue('green.500', 'green.300');
  const mediumPrivacyColor = useColorModeValue('yellow.500', 'yellow.300');
  const lowPrivacyColor = useColorModeValue('red.500', 'red.300');
  
  // Determine privacy level based on epsilon (for differential privacy)
  // Lower epsilon means higher privacy
  let privacyLevel = 'N/A';
  let privacyColor = 'gray.500';
  
  if (privacyMechanism === 'differential_privacy' && epsilon !== undefined) {
    if (epsilon <= 1) {
      privacyLevel = 'High';
      privacyColor = highPrivacyColor;
    } else if (epsilon <= 5) {
      privacyLevel = 'Medium';
      privacyColor = mediumPrivacyColor;
    } else {
      privacyLevel = 'Low';
      privacyColor = lowPrivacyColor;
    }
  } else if (privacyMechanism === 'secure_aggregation') {
    privacyLevel = 'High';
    privacyColor = highPrivacyColor;
  }
  
  // Get privacy mechanism display name
  const mechanismName = privacyMechanism === 'differential_privacy' ? 
    'Differential Privacy' : 
    privacyMechanism === 'secure_aggregation' ? 
    'Secure Aggregation' : 
    'None';
  
  // Helper text for each privacy mechanism
  const privacyHelperText = {
    'differential_privacy': 'Differential Privacy adds noise to protect individual data while maintaining aggregate accuracy. Lower ε means higher privacy.',
    'secure_aggregation': 'Secure Aggregation combines encrypted updates from clients, preventing the server from seeing individual updates.',
    'null': 'No privacy mechanism is being used. Individual client data may be exposed.'
  };
  
  // Calculate meter fill percentage (for visual representation)
  const getFillPercentage = () => {
    if (privacyMechanism === 'secure_aggregation') return 90;
    if (privacyMechanism === null) return 10;
    if (epsilon === undefined) return 50;
    
    // For differential privacy, inverse relationship with epsilon
    // Lower epsilon = higher privacy = higher fill percentage
    return Math.max(10, Math.min(90, 100 - (epsilon * 15)));
  };
  
  const fillPercentage = getFillPercentage();
  
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
          Privacy Protection
        </Heading>
        <IconBox 
          icon={FiShield} 
          size={20} 
          color={privacyColor}
        />
      </Flex>
      
      <Flex direction="column" gap={2}>
        <Flex justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="medium">Mechanism:</Text>
          <Badge colorScheme={
            privacyMechanism === 'differential_privacy' ? 'blue' : 
            privacyMechanism === 'secure_aggregation' ? 'green' : 
            'gray'
          }>
            {mechanismName}
          </Badge>
        </Flex>
        
        {privacyMechanism === 'differential_privacy' && epsilon !== undefined && (
          <Flex justify="space-between" align="center">
            <Text fontSize="sm" fontWeight="medium">Epsilon (ε):</Text>
            <Text fontSize="sm" fontWeight="bold">{epsilon.toFixed(2)}</Text>
          </Flex>
        )}
        
        <Flex justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="medium">Protection Level:</Text>
          <Badge colorScheme={
            privacyLevel === 'High' ? 'green' : 
            privacyLevel === 'Medium' ? 'yellow' : 
            privacyLevel === 'Low' ? 'red' : 
            'gray'
          }>
            {privacyLevel}
          </Badge>
        </Flex>
        
        {/* Privacy Meter Visualization */}
        <Box mt={2} mb={2}>
          <Box
            w="100%"
            h="8px"
            bg="gray.200"
            _dark={{ bg: 'gray.700' }}
            borderRadius="full"
            overflow="hidden"
          >
            <Box 
              h="100%" 
              w={`${fillPercentage}%`} 
              bg={privacyColor}
              borderRadius="full"
              transition="width 0.5s ease-in-out"
            />
          </Box>
        </Box>
        
        <Flex align="center" mt={1}>
          <Box as="span" mr="4px">
            <IconBox 
              icon={FiInfo} 
              size={14} 
              color="gray.500" 
              _dark={{ color: 'gray.400' }}
            />
          </Box>
          <Text fontSize="xs" color="gray.500" _dark={{ color: 'gray.400' }}>
            {privacyHelperText[privacyMechanism ?? 'null']}
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
};

export default PrivacyMeter;